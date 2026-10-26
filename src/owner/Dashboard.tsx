/** The owner's dashboard, as the reference's owner-dashboard. */
import { useState } from "react";
import {
  cardValue,
  recordTitle,
  tableOf,
  type AppChart,
  type AppList,
  type AppRecord,
} from "../apps/model";
import { useOwner } from "./context";
import {
  firstNameOf,
  formatMoneyCompact,
  formatRelativeTime,
  greetingFor,
  pluralise,
} from "./format";
import {
  cardIcon,
  cardTone,
  chartBars,
  chartsOf,
  countIn,
  historyOf,
  isActionList,
  isWaiting,
  peopleFor,
  workflowFor,
  type Workflow,
} from "./roles";
import { useToast } from "./toast";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  GoLink,
  Identity,
  IconTile,
  PageHeader,
  Skeleton,
  StatCard,
} from "./ui";
import { amountOf, personOf } from "./view";

/** A list's records as the server would give them: filtered, sorted, limited. */
function listRecords(list: AppList, records: AppRecord[]) {
  const value = (r: AppRecord) =>
    list.sort ? (r.totals?.[list.sort] ?? r.values[list.sort]) : r.createdAt;
  return records
    .filter((r) => !list.statuses.length || list.statuses.includes(r.status))
    .sort((a, b) => {
      const x = value(a),
        y = value(b);
      if (typeof x === "number" || typeof y === "number")
        return Number(y ?? 0) - Number(x ?? 0);
      return String(y ?? "").localeCompare(String(x ?? ""));
    })
    .slice(0, list.limit);
}

export function Dashboard() {
  const ctx = useOwner();
  const toast = useToast();
  const { model, data } = ctx;
  const app = model.app;
  const [now] = useState(() => new Date());
  const loading = app.tables.some(
    (t) => !data.lists[t.id] && !data.listErrors[t.id],
  );
  const failed = app.tables.every((t) => data.listErrors[t.id]);
  const w = model.primaryWorkflow;
  const people = model.primaryPeople;

  if (loading) return <DashboardSkeleton />;
  if (failed)
    return (
      <ErrorState
        title="Couldn't load the dashboard"
        description={
          data.listErrors[app.tables[0]?.id ?? ""] ||
          "The request failed. Nothing was changed."
        }
        onRetry={() => void ctx.actions.refresh()}
      />
    );

  const pending = w
    ? ctx.records(w.table.id).filter((r) => isWaiting(w, r))
    : [];
  const emptyShop =
    !!people &&
    ctx.records(people.table.id).length === 0 &&
    model.workflows.every((x) => ctx.records(x.table.id).length === 0);
  if (emptyShop && people)
    return (
      <Card>
        <CardBody>
          <EmptyState
            icon="users"
            title={`No ${people.table.name.toLowerCase()} yet`}
            description={`Add the first ${people.table.singular.toLowerCase()} with their name and phone number. They can then record purchases from your website straight away.`}
            action={
              <Button
                variant="primary"
                icon="userPlus"
                onClick={() => ctx.openNew(people.table)}
              >
                {`Add your first ${people.table.singular.toLowerCase()}`}
              </Button>
            }
          />
        </CardBody>
      </Card>
    );

  const waitingLabel = !w
    ? `Here's how ${ctx.shopName} is doing.`
    : pending.length === 0
      ? "Nothing is waiting for review."
      : `${pluralise(pending.length, w.noun)} ${pending.length === 1 ? "is" : "are"} waiting for your review.`;

  const lists = app.dashboard.lists.filter((l) => tableOf(app, l.table));
  const mainLists = lists.filter((l) => workflowFor(model, l.table));
  const railLists = lists.filter((l) => !workflowFor(model, l.table));

  return (
    <>
      <PageHeader
        title={`${greetingFor(now)}, ${firstNameOf(ctx.account.email)}`}
        description={waitingLabel}
        actions={
          <>
            <Button
              variant="secondary"
              icon="refresh"
              onClick={() =>
                void ctx.actions
                  .refresh()
                  .then(() =>
                    toast("info", "Refreshed", "Dashboard is up to date."),
                  )
              }
            >
              Refresh
            </Button>
            {w && (
              <ButtonLink
                variant="primary"
                href={ctx.href({ page: "table", table: w.table.id })}
                onGo={() => ctx.go({ page: "table", table: w.table.id })}
              >
                {`Review ${w.submitted ? "submissions" : w.table.name.toLowerCase()}`}
              </ButtonLink>
            )}
          </>
        }
      />

      {app.dashboard.cards.length > 0 && (
        <div className="ow-statGrid">
          {app.dashboard.cards.map((card) => (
            <DashboardCard key={card.id} cardId={card.id} />
          ))}
        </div>
      )}

      <div
        className={railLists.length || chartsOf(model).length ? "ow-split" : ""}
      >
        <div className="ow-stack">
          {mainLists.map((l) => (
            <QueueCard key={l.id} list={l} now={now} />
          ))}
          {!mainLists.length && w && (
            <QueueCard
              list={{
                id: "queue",
                name: "Waiting for approval",
                table: w.table.id,
                sort: "",
                statuses: w.waiting.map((s) => s.id),
                limit: 5,
                actions: true,
              }}
              now={now}
            />
          )}
        </div>
        <div className="ow-stack">
          {railLists.map((l) => (
            <PeopleListCard key={l.id} list={l} />
          ))}
          {chartsOf(model).map((c) => (
            <ChartCard key={c.id} chart={c} now={now} />
          ))}
          <PushStatusCard />
        </div>
      </div>
    </>
  );
}

function DashboardCard({ cardId }: { cardId: string }) {
  const ctx = useOwner();
  const { model } = ctx;
  const app = model.app;
  const card = app.dashboard.cards.find((c) => c.id === cardId)!;
  const table = tableOf(app, card.table);
  const records = table ? ctx.records(table.id) : [];
  const value = cardValue(card, records);
  const tone = cardTone(model, card);
  const money =
    card.money ||
    (card.op === "sum" &&
      table?.fields.find((f) => f.id === card.field)?.type === "money");
  const shown = money
    ? tone === "slate"
      ? formatMoneyCompact(value, app.currency)
      : ctx.money(value)
    : value.toLocaleString("en-IN");
  return (
    <StatCard
      tone={tone}
      icon={cardIcon(tone)}
      label={card.name}
      value={shown}
      meta={card.caption ?? captionFor(ctx, card.id, value)}
    />
  );
}
/**
 * The line under a card when the builder gave none, as the reference has it:
 * "11 rejected submissions", "Waiting for you", "214 approved",
 * "Across all 42 customers".
 */
function captionFor(
  ctx: ReturnType<typeof useOwner>,
  cardId: string,
  value: number,
) {
  const { model } = ctx;
  const card = model.app.dashboard.cards.find((c) => c.id === cardId)!;
  const tone = cardTone(model, card);
  const w = workflowFor(model, card.table) ?? model.primaryWorkflow;
  if (tone === "accent")
    return value === 0 ? "All caught up" : "Waiting for you";
  if (tone === "plain" && peopleFor(model, card.table) && w?.bad.length) {
    const n = countIn(ctx.records(w.table.id), w.bad);
    return pluralise(n, `${w.bad[0].name.toLowerCase()} ${w.noun}`);
  }
  if (tone === "slate" && w) {
    const statuses = w.table.statuses.filter((s) =>
      card.statuses.includes(s.id),
    );
    if (statuses.length)
      return `${countIn(ctx.records(w.table.id), statuses)} ${statuses[0].name.toLowerCase()}`;
  }
  if (tone === "dark" && model.primaryPeople) {
    const p = model.primaryPeople;
    const n = ctx.records(p.table.id).length;
    return `Across all ${n} ${(n === 1 ? p.table.singular : p.table.name).toLowerCase()}`;
  }
  return undefined;
}

function QueueCard({ list, now }: { list: AppList; now: Date }) {
  const ctx = useOwner();
  const w = workflowFor(ctx.model, list.table)!;
  const all = ctx.records(w.table.id);
  const rows = listRecords(list, all);
  const actions = isActionList(ctx.model, list);
  const waitingTotal = all.filter((r) => isWaiting(w, r)).length;
  const pendingList = list.statuses.every((id) =>
    w.waiting.some((s) => s.id === id),
  );
  const titleId = `queue-${list.id}`;
  return (
    <Card labelledBy={titleId}>
      <CardHeader
        id={titleId}
        title={list.name}
        badge={
          pendingList && waitingTotal > 0 ? (
            <Badge tone="pending" dot>
              {`${waitingTotal} pending`}
            </Badge>
          ) : null
        }
        actions={
          <GoLink
            className="ow-btn ow-btn-ghost ow-btn-sm"
            href={ctx.href({ page: "table", table: w.table.id })}
            onGo={() => ctx.go({ page: "table", table: w.table.id })}
          >
            View all
          </GoLink>
        }
      />
      <CardBody flush>
        {rows.length === 0 ? (
          <EmptyState
            tone="success"
            icon="checkCircle"
            title="Nothing waiting"
            description={`Every ${w.noun} has been reviewed. New ones arrive here and notify your phone.`}
            action={
              ctx.model.primaryPeople ? (
                <ButtonLink
                  href={ctx.href({
                    page: "table",
                    table: ctx.model.primaryPeople.table.id,
                  })}
                  onGo={() =>
                    ctx.go({
                      page: "table",
                      table: ctx.model.primaryPeople!.table.id,
                    })
                  }
                >
                  {`Go to ${ctx.model.primaryPeople.table.name.toLowerCase()}`}
                </ButtonLink>
              ) : undefined
            }
          />
        ) : (
          <QueueTable
            w={w}
            rows={rows}
            actions={actions}
            now={now}
            caption={list.name}
          />
        )}
      </CardBody>
    </Card>
  );
}

function QueueTable({
  w,
  rows,
  actions,
  now,
  caption,
}: {
  w: Workflow;
  rows: AppRecord[];
  actions: boolean;
  now: Date;
  caption: string;
}) {
  const ctx = useOwner();
  return (
    <div className="ow-tableWrap">
      <table className="ow-table ow-tableStack">
        <caption className="ow-srOnly">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{w.person?.table.singular ?? w.table.singular}</th>
            {w.table.prefix && <th scope="col">Reference</th>}
            {w.amount && (
              <th scope="col" className="ow-textRight">
                Amount
              </th>
            )}
            <th scope="col">Submitted</th>
            <th scope="col">
              <span className="ow-srOnly">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const person = personOf(ctx, w, r);
            const label = r.ref || person.name;
            return (
              <tr key={r.id}>
                <td data-label={w.person?.table.singular ?? w.table.singular}>
                  <Identity name={person.name} meta={person.phone} />
                </td>
                {w.table.prefix && (
                  <td data-label="Reference">
                    <span className="ow-mono">{r.ref}</span>
                  </td>
                )}
                {w.amount && (
                  <td data-label="Amount" className="ow-textRight">
                    <span className="ow-amount">
                      {ctx.money(amountOf(w.amount, r))}
                    </span>
                  </td>
                )}
                <td data-label="Submitted">
                  <span className="ow-subtle ow-nowrap">
                    {formatRelativeTime(r.createdAt, now)}
                  </span>
                </td>
                <td data-label="Actions">
                  <div className="ow-rowActions">
                    {actions ? (
                      w.table.actions
                        .filter((a) => a.from.includes(r.status))
                        .map((a) => (
                          <Button
                            key={a.id}
                            size="sm"
                            variant={
                              a.tone === "danger" ? "dangerQuiet" : "success"
                            }
                            aria-label={`${a.name} ${label}`}
                            onClick={() => ctx.review(r, a)}
                          >
                            {a.name}
                          </Button>
                        ))
                    ) : (
                      <GoLink
                        className="ow-btn ow-btn-ghost ow-btn-sm"
                        href={ctx.href({
                          page: "table",
                          table: w.table.id,
                          record: r.id,
                        })}
                        onGo={() =>
                          ctx.go({
                            page: "table",
                            table: w.table.id,
                            record: r.id,
                          })
                        }
                      >
                        View
                      </GoLink>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PeopleListCard({ list }: { list: AppList }) {
  const ctx = useOwner();
  const table = tableOf(ctx.model.app, list.table)!;
  const p = peopleFor(ctx.model, table.id);
  const rows = listRecords(list, ctx.records(table.id));
  const total = table.totals.find((t) => t.id === list.sort);
  const sortField = table.fields.find((f) => f.id === list.sort);
  const link = p?.workflows[0];
  const children = link ? ctx.records(link.workflow.table.id) : [];
  const titleId = `list-${list.id}`;
  return (
    <Card labelledBy={titleId}>
      <CardHeader
        id={titleId}
        title={list.name}
        actions={
          <GoLink
            className="ow-btn ow-btn-ghost ow-btn-sm"
            href={ctx.href({ page: "table", table: table.id })}
            onGo={() => ctx.go({ page: "table", table: table.id })}
          >
            All
          </GoLink>
        }
      />
      <CardBody>
        {rows.length === 0 ? (
          <p className="ow-subtle">
            {total
              ? `No ${total.name.toLowerCase()} yet.`
              : "Nothing here yet."}
          </p>
        ) : (
          <ul className="ow-earners">
            {rows.map((r) => {
              const good = link
                ? countIn(historyOf(link, r.id, children), link.workflow.good)
                : 0;
              const value = total
                ? Number(r.totals?.[total.id] ?? 0)
                : sortField &&
                    (sortField.type === "money" || sortField.type === "number")
                  ? Number(r.values[sortField.id] ?? 0)
                  : null;
              return (
                <li key={r.id}>
                  <GoLink
                    className="ow-earnerRow"
                    href={ctx.href({
                      page: "table",
                      table: table.id,
                      record: r.id,
                    })}
                    onGo={() =>
                      ctx.go({ page: "table", table: table.id, record: r.id })
                    }
                  >
                    <Identity
                      name={recordTitle(table, r)}
                      meta={
                        link
                          ? `${good} ${(link.workflow.good[0]?.name ?? "approved").toLowerCase()}`
                          : undefined
                      }
                    />
                    {value !== null && (
                      <span className="ow-amount">
                        {total?.money || sortField?.type === "money"
                          ? ctx.money(value)
                          : value.toLocaleString("en-IN")}
                      </span>
                    )}
                  </GoLink>
                </li>
              );
            })}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function ChartCard({ chart, now }: { chart: AppChart; now: Date }) {
  const ctx = useOwner();
  const table = tableOf(ctx.model.app, chart.table);
  const records = table ? ctx.records(table.id) : [];
  const bars = chartBars(chart, records, now);
  const money =
    chart.money ||
    (chart.op === "sum" &&
      table?.fields.find((f) => f.id === chart.field)?.type === "money");
  const show = (v: number) =>
    money ? ctx.money(v) : v.toLocaleString("en-IN");
  const max = Math.max(...bars.map((b) => b.value), 0);
  const current = bars[bars.length - 1];
  const awarded = !!table?.actions.some((a) =>
    a.set.includes(chart.field ?? ""),
  );
  const titleId = `chart-${chart.id}`;
  return (
    <Card labelledBy={titleId}>
      <CardHeader id={titleId} title={chart.name} />
      <CardBody>
        <div
          className="ow-barChart"
          role="img"
          aria-label={`${chart.name}: ${bars.map((b) => `${b.long} ${show(b.value)}`).join(", ")}`}
        >
          {bars.map((b, i) => (
            <div key={b.key} className="ow-barCol">
              <span
                className={
                  i === bars.length - 1 ? "ow-bar" : "ow-bar ow-barMuted"
                }
                style={{
                  height: `${max ? Math.round((b.value / max) * 100) : 0}%`,
                }}
              />
              <span className="ow-barLabel">{b.label}</span>
            </div>
          ))}
        </div>
      </CardBody>
      <div className="ow-cardFooter">
        <span className="ow-subtle">
          {`${show(current?.value ?? 0)} ${awarded ? "awarded " : ""}this month`}
        </span>
      </div>
    </Card>
  );
}

function PushStatusCard() {
  const ctx = useOwner();
  if (ctx.deviceCount === null) return null;
  const on = ctx.deviceCount > 0;
  return (
    <Card padded className="ow-stackSm">
      <div className="ow-row">
        <IconTile
          icon={on ? "bell" : "bellOff"}
          tone={on ? "success" : "muted"}
        />
        <div className="ow-grow">
          <p className="ow-cardTitle">
            {on ? "Push notifications on" : "Push notifications off"}
          </p>
          <p className="ow-subtle">
            {on
              ? `${pluralise(ctx.deviceCount, "device")} will alert you on new ${ctx.model.primaryWorkflow?.noun ?? "record"}s`
              : `You will not be told when a ${ctx.model.primaryPeople?.table.singular.toLowerCase() ?? "visitor"} submits`}
          </p>
        </div>
      </div>
      <ButtonLink
        size="sm"
        block
        href={ctx.href({ page: "settings" })}
        onGo={() => ctx.go({ page: "settings" })}
      >
        {on ? "Manage devices" : "Turn on notifications"}
      </ButtonLink>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true">
      <span className="ow-srOnly">Loading the dashboard</span>
      <div className="ow-statGrid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="ow-card ow-cardPad">
            <Skeleton shape="chip" width="40%" />
            <div className="ow-skeletonGap">
              <Skeleton shape="title" width="60%" />
            </div>
          </div>
        ))}
      </div>
      <div className="ow-split">
        <div className="ow-card ow-cardBody">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="ow-skeletonRow">
              <Skeleton shape="avatar" />
              <Skeleton width="45%" />
              <Skeleton width="20%" />
            </div>
          ))}
        </div>
        <div className="ow-card ow-cardBody">
          <Skeleton shape="block" />
        </div>
      </div>
    </div>
  );
}

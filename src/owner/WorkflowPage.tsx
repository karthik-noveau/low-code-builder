/**
 * A table with statuses and actions, as the reference's Submissions page:
 * a tab per status with counts, search, sort, pagination, inline Approve /
 * Reject, and a detail drawer with the record's timeline.
 */
import { useMemo, useState } from "react";
import {
  fieldOf,
  statusOf,
  type AppRecord,
  type AppStatus,
} from "../apps/model";
import { downloadCsv, recordRows } from "../apps/app-helpers";
import { useOwner } from "./context";
import { formatDateTime, formatRelativeTime, pluralise } from "./format";
import {
  actionsFor,
  countIn,
  historyOf,
  isWaiting,
  reviewedAt,
  statusLabel,
  statusTone,
  type Workflow,
} from "./roles";
import { useToast } from "./toast";
import {
  Badge,
  Button,
  Card,
  CardBody,
  DefinitionList,
  Drawer,
  EmptyState,
  ErrorState,
  GoLink,
  Identity,
  InlineAlert,
  PageHeader,
  Pagination,
  SearchBox,
  Select,
  SkeletonRows,
  Tabs,
} from "./ui";
import { Icon } from "./Icon";
import { amountOf, cap, personOf, valueText } from "./view";

type Sort = "newest" | "oldest" | "amountDesc" | "amountAsc";
const PAGE_SIZE = 10;

export function WorkflowPage({
  w,
  status,
  recordId,
}: {
  w: Workflow;
  status?: string;
  recordId?: string;
}) {
  const ctx = useOwner();
  const toast = useToast();
  const { data } = ctx;
  const table = w.table;
  const all = ctx.records(table.id);
  const loaded = !!data.lists[table.id];
  const error = data.listErrors[table.id];
  const [now] = useState(() => new Date());
  const firstWaiting = w.waiting[0]?.id ?? table.statuses[0]?.id ?? "";
  const tab =
    status && table.statuses.some((s) => s.id === status)
      ? status
      : firstWaiting;
  const current = statusOf(table, tab);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [page, setPage] = useState(1);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const rows = all
      .filter((r) => r.status === tab)
      .filter((r) => {
        if (!q) return true;
        const person = personOf(ctx, w, r);
        const haystack = [
          r.ref,
          person.name,
          ...table.fields.map((f) => String(r.values[f.id] ?? "")),
        ]
          .join(" ")
          .toLowerCase();
        return (
          haystack.includes(q) ||
          (digits.length >= 3 &&
            person.phone.replace(/\D/g, "").includes(digits))
        );
      });
    const amount = (r: AppRecord) => amountOf(w.amount, r);
    return rows.sort((a, b) =>
      sort === "newest"
        ? b.createdAt.localeCompare(a.createdAt)
        : sort === "oldest"
          ? a.createdAt.localeCompare(b.createdAt)
          : sort === "amountDesc"
            ? amount(b) - amount(a)
            : amount(a) - amount(b),
    );
  }, [all, tab, search, sort, ctx, w, table.fields]);
  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const shownPage = Math.min(page, pages);
  const rows = visible.slice(
    (shownPage - 1) * PAGE_SIZE,
    shownPage * PAGE_SIZE,
  );
  const open = recordId ? all.find((r) => r.id === recordId) : undefined;

  const setTab = (next: string) => {
    setPage(1);
    ctx.go({ page: "table", table: table.id, status: next });
  };
  const subtitle =
    w.approve && w.reward && w.reject
      ? `${w.approve.name} a ${table.singular.toLowerCase()} to award a ${w.reward.name.toLowerCase()}, or ${w.reject.name.toLowerCase()} it with a reason.`
      : `Review each ${table.singular.toLowerCase()} and move it to its next step.`;
  const exportCsv = () => {
    downloadCsv(
      recordRows(ctx.model.app, table, visible, ctx.linkTitle),
      `${table.name.toLowerCase().replace(/\W+/g, "-")}-${statusLabel(current, tab).toLowerCase()}.csv`,
    );
    toast(
      "info",
      "Export ready",
      `A CSV of ${pluralise(visible.length, w.noun)} downloaded.`,
    );
  };

  return (
    <>
      <PageHeader
        title={table.name}
        description={subtitle}
        actions={
          <Button
            size="sm"
            icon="download"
            onClick={exportCsv}
            disabled={!visible.length}
          >
            Export
          </Button>
        }
      />
      <Card>
        <Tabs
          idBase={`wf-${table.id}`}
          label={`${table.singular} status`}
          value={tab}
          onChange={setTab}
          tabs={table.statuses.map((s) => ({
            value: s.id,
            label: statusLabel(s),
            count: loaded ? countIn(all, [s]) : undefined,
          }))}
        />
        <div
          role="tabpanel"
          id={`wf-${table.id}-panel`}
          aria-labelledby={`wf-${table.id}-tab-${tab}`}
        >
          <div className="ow-cardHeader ow-toolbar">
            <SearchBox
              label={`Search ${w.noun}s`}
              placeholder="Search reference, name or phone"
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
            />
            <div className="ow-spacer" />
            <Select
              label="Sort by"
              value={sort}
              onChange={(v) => setSort(v as Sort)}
              options={[
                { value: "newest", label: "Newest first" },
                { value: "oldest", label: "Oldest first" },
                ...(w.amount
                  ? [
                      { value: "amountDesc", label: "Highest amount" },
                      { value: "amountAsc", label: "Lowest amount" },
                    ]
                  : []),
              ]}
            />
          </div>
          <CardBody flush>
            {!loaded && !error ? (
              <SkeletonRows label={`Loading ${w.noun}s`} />
            ) : error && !loaded ? (
              <ErrorState
                title={`Couldn't load ${w.noun}s`}
                description={
                  error ||
                  "The server responded with an error. Nothing was changed."
                }
                onRetry={() => void ctx.actions.refresh()}
              />
            ) : visible.length === 0 && search.trim() ? (
              <EmptyState
                tone="neutral"
                icon="search"
                title="Nothing matches that"
                description={`No ${statusLabel(current, tab).toLowerCase()} ${w.noun} matches “${search.trim()}”.`}
                action={
                  <Button onClick={() => setSearch("")}>Clear search</Button>
                }
              />
            ) : visible.length === 0 ? (
              <EmptyCopy w={w} status={current} />
            ) : (
              <>
                <RecordTable
                  w={w}
                  status={current}
                  rows={rows}
                  now={now}
                  sort={sort}
                  onSort={setSort}
                />
                <Pagination
                  page={shownPage}
                  pageSize={PAGE_SIZE}
                  total={visible.length}
                  onPage={setPage}
                />
              </>
            )}
          </CardBody>
        </div>
      </Card>
      {open && (
        <RecordDetailDrawer
          w={w}
          record={open}
          now={now}
          onClose={() =>
            ctx.go({ page: "table", table: table.id, status: tab })
          }
        />
      )}
    </>
  );
}

function EmptyCopy({ w, status }: { w: Workflow; status?: AppStatus }) {
  const noun = w.noun;
  const copy =
    status?.tone === "waiting"
      ? {
          title: "Nothing waiting",
          description: `Every ${noun} has been reviewed. New ones arrive here and notify your phone.`,
        }
      : status?.tone === "good"
        ? {
            title: `Nothing ${status.name.toLowerCase()} yet`,
            description: w.reward
              ? `${cap(status.name)} purchases and the ${w.reward.name.toLowerCase()} you awarded will appear here.`
              : `${cap(noun)}s moved to ${status.name.toLowerCase()} appear here.`,
          }
        : status?.tone === "bad"
          ? {
              title: `Nothing ${status.name.toLowerCase()}`,
              description: `${cap(noun)}s you turn down will be listed here with the reason you gave.`,
            }
          : {
              title: "Nothing here",
              description: `No ${noun} is ${status?.name.toLowerCase() ?? "here"} right now.`,
            };
  return (
    <EmptyState
      tone={status?.tone === "waiting" ? "success" : "neutral"}
      icon={status?.tone === "waiting" ? "checkCircle" : "inbox"}
      title={copy.title}
      description={copy.description}
      action={<span className="ow-subtle">Nothing to do here</span>}
    />
  );
}

/**
 * Each tab shows different columns: a waiting row has its description and
 * the actions; an approved row its reward; a rejected row its reason.
 */
function RecordTable({
  w,
  status,
  rows,
  now,
  sort,
  onSort,
}: {
  w: Workflow;
  status?: AppStatus;
  rows: AppRecord[];
  now: Date;
  sort: Sort;
  onSort: (sort: Sort) => void;
}) {
  const ctx = useOwner();
  const table = w.table;
  const waiting = status?.tone === "waiting" || !status;
  const good = status?.tone === "good";
  const bad = status?.tone === "bad";
  const setFields = good
    ? table.actions
        .filter((a) => a.to === status!.id)
        .flatMap((a) => a.set)
        .map((id) => fieldOf(table, id))
        .filter((f) => !!f)
    : [];
  const sorted = sort === "amountDesc" || sort === "amountAsc";
  const personLabel = w.person?.table.singular ?? table.singular;
  const description =
    w.description && w.description.id !== table.titleField
      ? w.description
      : undefined;
  const open = (r: AppRecord) =>
    ctx.go({ page: "table", table: table.id, record: r.id, status: r.status });
  return (
    <div className="ow-tableWrap">
      <table className="ow-table ow-tableStack">
        <caption className="ow-srOnly">{`${statusLabel(status)} ${w.noun}s`}</caption>
        <thead>
          <tr>
            <th scope="col">{personLabel}</th>
            {table.prefix && <th scope="col">Reference</th>}
            {waiting && (description || !w.person) && (
              <th scope="col">
                {description ? "Description" : table.singular}
              </th>
            )}
            {w.amount && (
              <th
                scope="col"
                className="ow-textRight"
                aria-sort={
                  sorted
                    ? sort === "amountDesc"
                      ? "descending"
                      : "ascending"
                    : undefined
                }
              >
                <button
                  type="button"
                  className="ow-sortBtn"
                  onClick={() =>
                    onSort(sort === "amountDesc" ? "amountAsc" : "amountDesc")
                  }
                >
                  Amount
                  <Icon
                    name={
                      sorted && sort === "amountAsc"
                        ? "chevronUp"
                        : "chevronDown"
                    }
                    size={12}
                  />
                </button>
              </th>
            )}
            {setFields.map((f) => (
              <th
                key={f.id}
                scope="col"
                className={f.type === "money" ? "ow-textRight" : undefined}
              >
                {f.name}
              </th>
            ))}
            {bad && <th scope="col">Reason</th>}
            <th scope="col">{waiting ? "Submitted" : "Reviewed"}</th>
            {good && <th scope="col">Status</th>}
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
                <td data-label={personLabel}>
                  <Identity
                    name={person.name}
                    meta={w.person ? person.phone : undefined}
                  />
                </td>
                {table.prefix && (
                  <td data-label="Reference">
                    <span className="ow-mono">{r.ref}</span>
                  </td>
                )}
                {waiting && (description || !w.person) && (
                  <td data-label="Description">
                    <span
                      className="ow-muted ow-clamp"
                      title={
                        description
                          ? String(r.values[description.id] ?? "")
                          : undefined
                      }
                    >
                      {description
                        ? String(r.values[description.id] ?? "")
                        : valueText(
                            ctx.model.app,
                            w,
                            table.titleField,
                            r,
                            ctx.linkTitle,
                          )}
                    </span>
                  </td>
                )}
                {w.amount && (
                  <td data-label="Amount" className="ow-textRight">
                    <span className="ow-amount">
                      {ctx.money(amountOf(w.amount, r))}
                    </span>
                  </td>
                )}
                {setFields.map((f) => (
                  <td
                    key={f.id}
                    data-label={f.name}
                    className={f.type === "money" ? "ow-textRight" : undefined}
                  >
                    {f.type === "money" ? (
                      <span className="ow-amount ow-positive">
                        {`+${ctx.money(Number(r.values[f.id] ?? 0))}`}
                      </span>
                    ) : (
                      valueText(ctx.model.app, w, f.id, r, ctx.linkTitle) || "—"
                    )}
                  </td>
                ))}
                {bad && (
                  <td data-label="Reason">
                    <span className="ow-muted ow-clamp" title={r.note}>
                      {r.note || "—"}
                    </span>
                  </td>
                )}
                <td data-label={waiting ? "Submitted" : "Reviewed"}>
                  <span className="ow-subtle ow-nowrap">
                    {waiting
                      ? formatRelativeTime(r.createdAt, now)
                      : reviewedAt(r)
                        ? formatDateTime(reviewedAt(r))
                        : "—"}
                  </span>
                </td>
                {good && (
                  <td data-label="Status">
                    <Badge tone="approved">{status!.name}</Badge>
                  </td>
                )}
                <td data-label="Actions">
                  <div className="ow-rowActions">
                    <Button
                      variant="ghost"
                      size="sm"
                      iconOnly
                      icon="eye"
                      aria-label={`View ${label}`}
                      onClick={() => open(r)}
                    />
                    {actionsFor(w, r).map((a) => (
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
                    ))}
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

/** The reference's submission detail drawer, with the record's timeline. */
function RecordDetailDrawer({
  w,
  record,
  now,
  onClose,
}: {
  w: Workflow;
  record: AppRecord;
  now: Date;
  onClose: () => void;
}) {
  const ctx = useOwner();
  const app = ctx.model.app;
  const table = w.table;
  const status = statusOf(table, record.status);
  const person = personOf(ctx, w, record);
  const people = w.person
    ? ctx.model.people.find((p) => p.table.id === w.person!.table.id)
    : undefined;
  const link = people?.workflows.find((l) => l.workflow.table.id === table.id);
  const theirs =
    link && person.id ? historyOf(link, person.id, ctx.records(table.id)) : [];
  const approvedCount = countIn(theirs, w.good);
  const total =
    people?.moneyTotal && person.record
      ? Number(person.record.totals?.[people.moneyTotal.id] ?? 0)
      : null;
  const decided = theirs
    .filter((r) => r.id !== record.id && !isWaiting(w, r))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);
  const allGood =
    decided.length >= 2 &&
    decided.every((r) => w.good.some((s) => s.id === r.status));
  const rate =
    w.reward && w.amount && allGood
      ? (decided.reduce((s, r) => s + amountOf(w.reward, r), 0) /
          Math.max(
            1,
            decided.reduce((s, r) => s + amountOf(w.amount, r), 0),
          )) *
        100
      : null;
  const actions = actionsFor(w, record);
  const shown = new Set(
    [w.person?.field.id, w.amount?.id, w.description?.id].filter(Boolean),
  );
  const otherFields = table.fields.filter(
    (f) =>
      !shown.has(f.id) &&
      record.values[f.id] !== undefined &&
      record.values[f.id] !== "",
  );
  const label = record.ref || person.name;

  return (
    <Drawer
      title={label}
      description={`Submitted ${formatRelativeTime(record.createdAt, now)}`}
      badge={
        status ? (
          <Badge tone={statusTone(status)} dot={status.tone === "waiting"}>
            {statusLabel(status)}
          </Badge>
        ) : null
      }
      onClose={onClose}
      footer={
        actions.length ? (
          <>
            {[...actions]
              .sort(
                (a, b) =>
                  Number(a.tone !== "danger") - Number(b.tone !== "danger"),
              )
              .map((a) => (
                <Button
                  key={a.id}
                  variant={a.tone === "danger" ? "dangerQuiet" : "success"}
                  onClick={() => ctx.review(record, a)}
                >
                  {a.name}
                </Button>
              ))}
          </>
        ) : undefined
      }
    >
      <div className="ow-stack">
        {w.person && (
          <div className="ow-identity">
            <span className="ow-avatar ow-avatar-lg" aria-hidden="true">
              {person.name
                .split(/\s+/)
                .slice(0, 2)
                .map((p) => p[0] ?? "")
                .join("")
                .toUpperCase()}
            </span>
            <div className="ow-identityText">
              <p className="ow-identityName ow-textMd">{person.name}</p>
              {person.phone && (
                <p className="ow-identityMeta">{person.phone}</p>
              )}
              {person.id && (
                <GoLink
                  className="ow-subtle ow-link"
                  href={ctx.href({
                    page: "table",
                    table: w.person.table.id,
                    record: person.id,
                  })}
                  onGo={() =>
                    ctx.go({
                      page: "table",
                      table: w.person!.table.id,
                      record: person.id,
                    })
                  }
                >
                  {`View ${w.person.table.singular.toLowerCase()} profile`}
                  <Icon name="chevronRight" size={12} />
                </GoLink>
              )}
            </div>
          </div>
        )}
        {w.amount && (
          <div className="ow-stat ow-stat-plain ow-statInline">
            <p className="ow-statLabel">{w.amount.name}</p>
            <p className="ow-statValue">
              {ctx.money(amountOf(w.amount, record))}
            </p>
          </div>
        )}
        <DefinitionList
          items={[
            ...(w.description
              ? [
                  {
                    term:
                      w.description.type === "longText"
                        ? "Description"
                        : w.description.name,
                    value: (
                      <span className="ow-ddPlain">
                        {valueText(
                          app,
                          w,
                          w.description.id,
                          record,
                          ctx.linkTitle,
                        )}
                      </span>
                    ),
                  },
                ]
              : []),
            ...otherFields.map((f) => ({
              term: f.name,
              value:
                f.type === "money" ? (
                  <span className="ow-amount">
                    {ctx.money(Number(record.values[f.id] ?? 0))}
                  </span>
                ) : (
                  valueText(app, w, f.id, record, ctx.linkTitle)
                ),
            })),
            { term: "Submitted at", value: formatDateTime(record.createdAt) },
            ...(record.ref
              ? [
                  {
                    term: "Reference",
                    value: <span className="ow-mono">{record.ref}</span>,
                  },
                ]
              : []),
            ...(record.note
              ? [
                  {
                    term: status?.tone === "bad" ? "Reason" : "Note",
                    value: record.note,
                  },
                ]
              : []),
            ...(total !== null && people?.moneyTotal
              ? [
                  {
                    term: `${w.person!.table.singular} total`,
                    value: (
                      <>
                        <span className="ow-amount">{ctx.money(total)}</span>
                        {` across ${pluralise(approvedCount, w.good[0]?.name.toLowerCase() === "approved" ? "approval" : "record")}`}
                      </>
                    ),
                  },
                ]
              : []),
          ]}
        />
        {rate !== null && (
          <InlineAlert tone="info">
            {`This ${w.person?.table.singular.toLowerCase() ?? "customer"}'s last ${decided.length} ${w.noun}s were all ${w.good[0]?.name.toLowerCase() ?? "approved"}. Average ${w.reward!.name.toLowerCase()} awarded: ${rate.toFixed(1)}%.`}
          </InlineAlert>
        )}
        <div>
          <p className="ow-cardTitle ow-gapBottom">Timeline</p>
          <ol className="ow-timeline">
            <li className="ow-timelineItem">
              <span
                className="ow-timelineDot ow-timelineDot-pending"
                aria-hidden="true"
              >
                <Icon name="receipt" size={14} />
              </span>
              <div className="ow-timelineBody">
                <p className="ow-timelineTop">
                  <strong>
                    {record.source === "visitor"
                      ? `${cap(w.noun)} received`
                      : "Added by you"}
                  </strong>
                </p>
                <p className="ow-timelineMeta">
                  {`${formatDateTime(record.createdAt)}${record.source === "visitor" && w.person ? ` · from ${person.name}` : ""}`}
                </p>
              </div>
            </li>
            {record.history.map((h, i) => {
              const s = statusOf(table, h.status);
              const action = table.actions.find((a) => a.id === h.action);
              return (
                <li key={`${h.at}-${i}`} className="ow-timelineItem">
                  <span
                    className={`ow-timelineDot ow-timelineDot-${statusTone(s)}`}
                    aria-hidden="true"
                  >
                    <Icon
                      name={
                        s?.tone === "bad"
                          ? "xCircle"
                          : s?.tone === "good"
                            ? "checkCircle"
                            : "clock"
                      }
                      size={14}
                    />
                  </span>
                  <div className="ow-timelineBody">
                    <p className="ow-timelineTop">
                      <strong>
                        {action?.name ?? statusLabel(s, h.status)}
                      </strong>
                      {s && (
                        <Badge tone={statusTone(s)}>{statusLabel(s)}</Badge>
                      )}
                    </p>
                    <p className="ow-timelineMeta">{`${formatDateTime(h.at)} · ${h.by}`}</p>
                    {h.note && <p className="ow-timelineNote">{h.note}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </Drawer>
  );
}

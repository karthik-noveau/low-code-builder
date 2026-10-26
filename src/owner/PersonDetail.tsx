/** One record's profile, as the reference's customer detail page. */
import { useState } from "react";
import { recordTitle, statusOf, type AppRecord } from "../apps/model";
import { errorText } from "../apps/app-helpers";
import { useOwner } from "./context";
import {
  formatDate,
  formatMoneyCompact,
  formatPhone,
  formatRelativeTime,
  pluralise,
  rewardRate,
} from "./format";
import {
  countIn,
  historyOf,
  isPaused,
  statusLabel,
  statusTone,
  type People,
} from "./roles";
import { useToast } from "./toast";
import {
  Avatar,
  Badge,
  Button,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  DefinitionList,
  EmptyState,
  ErrorState,
  GoLink,
  Select,
  Skeleton,
  SkeletonRows,
  StatCard,
} from "./ui";
import { DeleteDialog } from "./PeoplePage";
import { amountOf, valueText } from "./view";

export function PersonDetail({ p, recordId }: { p: People; recordId: string }) {
  const ctx = useOwner();
  const toast = useToast();
  const table = p.table;
  const loaded = !!ctx.data.lists[table.id];
  const error = ctx.data.listErrors[table.id];
  const record = ctx.records(table.id).find((r) => r.id === recordId);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [filter, setFilter] = useState("all");
  const back = () => ctx.go({ page: "table", table: table.id });

  if (!loaded && error)
    return (
      <ErrorState
        title={`Couldn't load the ${table.singular.toLowerCase()}`}
        description={error || "The request failed. Nothing was changed."}
        onRetry={() => void ctx.actions.refresh()}
      />
    );
  if (!loaded)
    return (
      <div aria-busy="true">
        <span className="ow-srOnly">{`Loading the ${table.singular.toLowerCase()}`}</span>
        <Skeleton shape="title" width="30%" />
        <div className="ow-skeletonGap">
          <Skeleton shape="block" />
        </div>
      </div>
    );
  if (!record)
    return (
      <Card>
        <CardBody>
          <EmptyState
            tone="neutral"
            icon="alertCircle"
            title={`${table.singular} not found`}
            description={`This ${table.singular.toLowerCase()} may have been deleted. The ${table.name.toLowerCase()} list is still here.`}
            action={
              <ButtonLink
                variant="primary"
                href={ctx.href({ page: "table", table: table.id })}
                onGo={back}
              >
                {`Back to ${table.name.toLowerCase()}`}
              </ButtonLink>
            }
          />
        </CardBody>
      </Card>
    );

  const name = recordTitle(table, record);
  const paused = isPaused(p, record);
  const phone = p.phone ? String(record.values[p.phone.id] ?? "") : "";
  const email = p.email ? String(record.values[p.email.id] ?? "") : "";
  const link = p.workflows[0];
  const w = link?.workflow;
  const history = link
    ? historyOf(link, record.id, ctx.records(link.workflow.table.id)).sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt),
      )
    : [];
  const historyLoaded = !link || !!ctx.data.lists[link.workflow.table.id];
  const good = w ? countIn(history, w.good) : 0;
  const waiting = w ? countIn(history, w.waiting) : 0;
  const total = (id?: string) => (id ? Number(record.totals?.[id] ?? 0) : 0);

  const toggle = async () => {
    if (!p.paused) return;
    setBusy(true);
    try {
      await ctx.actions.updateRecord(record, { [p.paused.id]: !paused });
      if (!paused)
        toast(
          "warning",
          "Marked inactive",
          "They can no longer record purchases.",
        );
      else
        toast("success", "Marked active", "They can record purchases again.");
    } catch (e) {
      toast("error", "That didn't work", errorText(e, "Try again."));
    } finally {
      setBusy(false);
    }
  };

  const visible =
    filter === "all" ? history : history.filter((r) => r.status === filter);

  return (
    <>
      <nav aria-label="Breadcrumb">
        <ol className="ow-breadcrumbs">
          <li>
            <GoLink
              href={ctx.href({ page: "dashboard" })}
              onGo={() => ctx.go({ page: "dashboard" })}
            >
              Dashboard
            </GoLink>
            <span className="ow-breadcrumbSep" aria-hidden="true">
              /
            </span>
          </li>
          <li>
            <GoLink
              href={ctx.href({ page: "table", table: table.id })}
              onGo={back}
            >
              {table.name}
            </GoLink>
            <span className="ow-breadcrumbSep" aria-hidden="true">
              /
            </span>
          </li>
          <li aria-current="page">{name}</li>
        </ol>
      </nav>

      <header className="ow-profileHeader">
        <div className="ow-identity ow-profileIdentity">
          <Avatar name={name} size="xl" />
          <div>
            <h2 className="ow-profileName">{name}</h2>
            <p className="ow-muted">
              {[phone && formatPhone(phone), email].filter(Boolean).join(" · ")}
            </p>
            <div className="ow-rowWrap ow-gapTop">
              {p.paused &&
                (paused ? (
                  <Badge tone="neutral">Inactive</Badge>
                ) : (
                  <Badge tone="approved">Active</Badge>
                ))}
              <span className="ow-subtle">{`${table.singular} since ${formatDate(record.createdAt)}`}</span>
            </div>
          </div>
        </div>
        <div className="ow-btnGroup">
          <Button size="sm" icon="edit" onClick={() => ctx.edit(record)}>
            Edit
          </Button>
          {p.paused ? (
            <Button
              size="sm"
              variant={paused ? "secondary" : "dangerQuiet"}
              loading={busy}
              onClick={() => void toggle()}
            >
              {paused ? "Mark active" : "Mark inactive"}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="dangerQuiet"
              icon="trash"
              onClick={() => setDeleting(true)}
            >
              Delete
            </Button>
          )}
        </div>
      </header>

      {(p.moneyTotal || p.spentTotal || p.waitingTotal || w) && (
        <div className="ow-statGrid">
          {p.moneyTotal && (
            <StatCard
              tone="dark"
              icon="wallet"
              label={w?.reward ? `${w.reward.name} earned` : p.moneyTotal.name}
              value={ctx.money(total(p.moneyTotal.id))}
              meta={
                w
                  ? `Across ${pluralise(good, `${w.good[0]?.name.toLowerCase() ?? "approved"} ${w.noun}`)}`
                  : undefined
              }
            />
          )}
          {p.spentTotal && (
            <StatCard
              tone="slate"
              icon="receipt"
              label={
                w?.amount
                  ? `${w.amount.name.replace(/\s*amount$/i, "")} value`
                  : p.spentTotal.name
              }
              value={formatMoneyCompact(
                total(p.spentTotal.id),
                ctx.model.app.currency,
              )}
              meta={`${w?.good[0]?.name ?? "Approved"} ${w?.table.name.toLowerCase() ?? "records"} only`}
            />
          )}
          {w && w.waiting.length > 0 && (
            <StatCard
              tone="accent"
              icon="clock"
              label={statusLabel(w.waiting[0])}
              value={String(
                p.waitingTotal ? total(p.waitingTotal.id) : waiting,
              )}
              meta={
                waiting === 0
                  ? "Nothing awaiting review"
                  : "Awaiting your review"
              }
            />
          )}
          {p.moneyTotal && p.spentTotal && (
            <StatCard
              tone="plain"
              icon="trendingUp"
              label="Average rate"
              value={rewardRate(total(p.moneyTotal.id), total(p.spentTotal.id))}
              meta={`${w?.reward?.name ?? "Reward"} of ${(w?.amount?.name.replace(/\s*amount$/i, "") ?? "purchase").toLowerCase()} value`}
            />
          )}
        </div>
      )}

      <div className={link ? "ow-split" : ""}>
        {link && w && (
          <Card>
            <CardHeader
              title={`${w.submitted ? "Submission" : w.table.singular} history`}
              actions={
                <Select
                  label="Filter by status"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: "all", label: "All statuses" },
                    ...w.table.statuses.map((s) => ({
                      value: s.id,
                      label: statusLabel(s),
                    })),
                  ]}
                />
              }
            />
            <CardBody flush>
              {!historyLoaded ? (
                <SkeletonRows label="Loading the history" rows={3} />
              ) : ctx.data.listErrors[w.table.id] &&
                !ctx.data.lists[w.table.id] ? (
                <ErrorState
                  title="Couldn't load the history"
                  description={`The ${table.singular.toLowerCase()}'s details are still shown above.`}
                  onRetry={() => void ctx.actions.refresh()}
                />
              ) : visible.length === 0 && history.length > 0 ? (
                <EmptyState
                  tone="neutral"
                  icon="filter"
                  title="Nothing with that status"
                  description={`This ${table.singular.toLowerCase()} has ${w.noun}s, but none matching the filter.`}
                  action={
                    <Button onClick={() => setFilter("all")}>
                      Show all statuses
                    </Button>
                  }
                />
              ) : visible.length === 0 ? (
                <EmptyState
                  icon="receipt"
                  title={`No ${w.noun}s yet`}
                  description={`This ${table.singular.toLowerCase()} has not recorded a ${w.table.singular.toLowerCase()}. They can do so from your website with their phone number.`}
                  action={<span className="ow-subtle">Nothing to review</span>}
                />
              ) : (
                <HistoryTable p={p} rows={visible} />
              )}
            </CardBody>
          </Card>
        )}

        <div className="ow-stack">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <DefinitionList
                items={[
                  ...table.fields
                    .filter((f) => f.id !== p.paused?.id)
                    .map((f) => ({
                      term: f.name,
                      value:
                        f.type === "phone"
                          ? formatPhone(String(record.values[f.id] ?? ""))
                          : valueText(
                              ctx.model.app,
                              p,
                              f.id,
                              record,
                              ctx.linkTitle,
                            ),
                    })),
                  { term: "Registered", value: formatDate(record.createdAt) },
                  {
                    term: "Last activity",
                    value: formatRelativeTime(record.updatedAt),
                  },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Quick actions" />
            <CardBody>
              <div className="ow-stackSm">
                {w && (
                  <ButtonLink
                    size="sm"
                    block
                    icon="inbox"
                    href={ctx.href({
                      page: "table",
                      table: w.table.id,
                      status: w.waiting[0]?.id,
                    })}
                    onGo={() =>
                      ctx.go({
                        page: "table",
                        table: w.table.id,
                        status: w.waiting[0]?.id,
                      })
                    }
                  >
                    {`Review ${waiting} pending`}
                  </ButtonLink>
                )}
                {phone && (
                  <a
                    className="ow-contactLink"
                    href={`tel:${ctx.model.app.currency === "INR" && phone.length === 10 ? "+91" : ""}${phone}`}
                  >
                    {`Call ${formatPhone(phone)}`}
                  </a>
                )}
                {email && (
                  <a className="ow-contactLink" href={`mailto:${email}`}>
                    Send an email
                  </a>
                )}
                {p.paused && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon="trash"
                    onClick={() => setDeleting(true)}
                  >
                    {`Delete ${table.singular.toLowerCase()}`}
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      {deleting && (
        <DeleteDialog
          p={p}
          record={record}
          onClose={() => setDeleting(false)}
          onDeleted={back}
        />
      )}
    </>
  );
}

function HistoryTable({ p, rows }: { p: People; rows: AppRecord[] }) {
  const ctx = useOwner();
  const w = p.workflows[0].workflow;
  return (
    <div className="ow-tableWrap">
      <table className="ow-table ow-tableStack">
        <caption className="ow-srOnly">{`This ${p.table.singular.toLowerCase()}'s ${w.noun}s`}</caption>
        <thead>
          <tr>
            {w.table.prefix && <th scope="col">Reference</th>}
            {w.description && <th scope="col">Description</th>}
            {w.amount && (
              <th scope="col" className="ow-textRight">
                Amount
              </th>
            )}
            {w.reward && (
              <th scope="col" className="ow-textRight">
                {w.reward.name}
              </th>
            )}
            <th scope="col">Status</th>
            <th scope="col">Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const status = statusOf(w.table, r.status);
            return (
              <tr key={r.id}>
                {w.table.prefix && (
                  <td data-label="Reference">
                    <GoLink
                      className="ow-mono"
                      href={ctx.href({
                        page: "table",
                        table: w.table.id,
                        record: r.id,
                        status: r.status,
                      })}
                      onGo={() =>
                        ctx.go({
                          page: "table",
                          table: w.table.id,
                          record: r.id,
                          status: r.status,
                        })
                      }
                    >
                      {r.ref}
                    </GoLink>
                  </td>
                )}
                {w.description && (
                  <td data-label="Description">
                    <span
                      className="ow-clamp"
                      title={String(r.values[w.description.id] ?? "")}
                    >
                      {String(r.values[w.description.id] ?? "")}
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
                {w.reward && (
                  <td data-label={w.reward.name} className="ow-textRight">
                    {w.good.some((s) => s.id === r.status) ? (
                      <span className="ow-amount ow-positive">{`+${ctx.money(amountOf(w.reward, r))}`}</span>
                    ) : (
                      <span className="ow-subtle">—</span>
                    )}
                  </td>
                )}
                <td data-label="Status">
                  <Badge
                    tone={statusTone(status)}
                    dot={status?.tone === "waiting"}
                  >
                    {statusLabel(status, r.status)}
                  </Badge>
                </td>
                <td data-label="Date">
                  <span className="ow-subtle">{formatDate(r.createdAt)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

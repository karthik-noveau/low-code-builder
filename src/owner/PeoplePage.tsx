/**
 * A table without a workflow, as the reference's Customers page: totals,
 * search, sort, pagination, add / edit, and a delete that's refused for
 * anyone with history ("mark inactive instead").
 */
import { useMemo, useState } from "react";
import { ApiError } from "../cloud/client";
import { recordTitle, type AppRecord } from "../apps/model";
import { errorText } from "../apps/app-helpers";
import { useOwner } from "./context";
import { formatDate, formatPhone, pluralise } from "./format";
import { countIn, historyOf, isPaused, type People } from "./roles";
import { useToast } from "./toast";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  ErrorState,
  GoLink,
  Identity,
  InlineAlert,
  MenuItem,
  Dropdown,
  Modal,
  PageHeader,
  Pagination,
  SearchBox,
  Select,
  SkeletonRows,
  StatCard,
} from "./ui";
import { Icon } from "./Icon";
import { valueText } from "./view";

type Sort = "createdAt" | "name" | "total" | "updatedAt";

export function PeoplePage({ p }: { p: People }) {
  const ctx = useOwner();
  const table = p.table;
  const all = ctx.records(table.id);
  const loaded = !!ctx.data.lists[table.id];
  const error = ctx.data.listErrors[table.id];
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("createdAt");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [deleting, setDeleting] = useState<AppRecord>();
  const link = p.workflows[0];
  const children = link ? ctx.records(link.workflow.table.id) : [];
  const total = p.moneyTotal;
  const singular = table.singular.toLowerCase();
  const plural = table.name.toLowerCase();

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const rows = all.filter((r) => {
      if (!q) return true;
      const text = table.fields
        .map((f) => String(r.values[f.id] ?? ""))
        .join(" ")
        .toLowerCase();
      return (
        text.includes(q) ||
        (digits.length >= 3 &&
          !!p.phone &&
          String(r.values[p.phone.id] ?? "").includes(digits))
      );
    });
    const name = (r: AppRecord) => recordTitle(table, r);
    return rows.sort((a, b) =>
      sort === "name"
        ? name(a).localeCompare(name(b))
        : sort === "total" && total
          ? Number(b.totals?.[total.id] ?? 0) -
            Number(a.totals?.[total.id] ?? 0)
          : sort === "updatedAt"
            ? b.updatedAt.localeCompare(a.updatedAt)
            : b.createdAt.localeCompare(a.createdAt),
    );
  }, [all, search, sort, table, total, p.phone]);
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  const shownPage = Math.min(page, pages);
  const rows = visible.slice((shownPage - 1) * pageSize, shownPage * pageSize);
  const sum = total
    ? all.reduce((s, r) => s + Number(r.totals?.[total.id] ?? 0), 0)
    : 0;
  const average = all.length ? Math.round(sum / all.length) : 0;
  const totalWord = total?.name.replace(/^total\s+/i, "").toLowerCase() ?? "";
  const goodName = link?.workflow.good[0]?.name ?? "Approved";
  const extra = table.fields.filter(
    (f) =>
      f.id !== table.titleField &&
      f.id !== p.phone?.id &&
      f.id !== p.email?.id &&
      f.id !== p.paused?.id &&
      f.type !== "longText",
  );

  return (
    <>
      <PageHeader
        title={table.name}
        description={`${pluralise(all.length, singular)} registered.`}
        actions={
          <Button
            variant="primary"
            icon="userPlus"
            onClick={() => ctx.openNew(table)}
          >
            {`New ${singular}`}
          </Button>
        }
      />

      <div className="ow-statGrid">
        <StatCard
          tone="plain"
          icon="users"
          label={`Registered ${plural}`}
          value={String(all.length)}
          meta={
            table.private
              ? "Only you can add one"
              : "Added by you or from your website"
          }
        />
        {total && (
          <>
            <StatCard
              tone="dark"
              icon="wallet"
              label={`Overall ${totalWord}`}
              value={total.money ? ctx.money(sum) : sum.toLocaleString("en-IN")}
              meta={`All ${plural}, all time`}
            />
            <StatCard
              tone="slate"
              icon="trendingUp"
              label={`Average per ${singular}`}
              value={
                total.money
                  ? ctx.money(average)
                  : average.toLocaleString("en-IN")
              }
              meta="Across the whole shop"
            />
          </>
        )}
      </div>

      <Card>
        <CardHeader
          title={`All ${plural}`}
          actions={
            <>
              <SearchBox
                label={`Search ${plural}`}
                placeholder={`Search name${p.phone ? ", phone" : ""}${p.email ? " or email" : ""}`}
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  setPage(1);
                }}
              />
              <Select
                label="Sort by"
                value={sort}
                onChange={(v) => {
                  setSort(v as Sort);
                  setPage(1);
                }}
                options={[
                  { value: "createdAt", label: "Recently added" },
                  ...(total
                    ? [{ value: "total", label: `Highest ${totalWord}` }]
                    : []),
                  { value: "name", label: "Name A–Z" },
                  { value: "updatedAt", label: "Recently active" },
                ]}
              />
            </>
          }
        />
        <CardBody flush>
          {!loaded && !error ? (
            <SkeletonRows label={`Loading ${plural}`} />
          ) : error && !loaded ? (
            <ErrorState
              title={`Couldn't load ${plural}`}
              description={error || "The request failed. Your data is safe."}
              onRetry={() => void ctx.actions.refresh()}
            />
          ) : visible.length === 0 && search.trim() ? (
            <EmptyState
              tone="neutral"
              icon="search"
              title={`No ${singular} matches that`}
              description={`Nothing found for “${search.trim()}”. Try a name${p.phone ? ", a phone number" : ""}${p.email ? ", or an email" : ""}.`}
              action={
                <Button onClick={() => setSearch("")}>Clear search</Button>
              }
            />
          ) : visible.length === 0 ? (
            <EmptyState
              icon="users"
              title={`No ${plural} yet`}
              description={`Add the first ${singular} with their name and phone number. They can then record purchases straight away.`}
              action={
                <Button
                  variant="primary"
                  icon="userPlus"
                  onClick={() => ctx.openNew(table)}
                >
                  {`Add your first ${singular}`}
                </Button>
              }
            />
          ) : (
            <>
              <div className="ow-tableWrap">
                <table className="ow-table ow-tableStack">
                  <caption className="ow-srOnly">{`Registered ${plural}`}</caption>
                  <thead>
                    <tr>
                      <th
                        scope="col"
                        aria-sort={sort === "name" ? "ascending" : undefined}
                      >
                        <button
                          type="button"
                          className="ow-sortBtn"
                          onClick={() => setSort("name")}
                        >
                          {table.singular}
                        </button>
                      </th>
                      {p.phone && <th scope="col">{p.phone.name}</th>}
                      {p.email && <th scope="col">{p.email.name}</th>}
                      {extra.slice(0, 2).map((f) => (
                        <th key={f.id} scope="col">
                          {f.name}
                        </th>
                      ))}
                      {total && (
                        <th
                          scope="col"
                          className="ow-textRight"
                          aria-sort={
                            sort === "total" ? "descending" : undefined
                          }
                        >
                          <button
                            type="button"
                            className="ow-sortBtn"
                            onClick={() => setSort("total")}
                          >
                            {totalWord
                              ? totalWord.charAt(0).toUpperCase() +
                                totalWord.slice(1)
                              : total.name}
                          </button>
                        </th>
                      )}
                      {link && (
                        <th scope="col" className="ow-textRight">
                          {goodName}
                        </th>
                      )}
                      {p.paused && <th scope="col">Status</th>}
                      <th scope="col">
                        <span className="ow-srOnly">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const name = recordTitle(table, r);
                      const paused = isPaused(p, r);
                      return (
                        <tr key={r.id}>
                          <td data-label={table.singular}>
                            <GoLink
                              className="ow-rowLink"
                              href={ctx.href({
                                page: "table",
                                table: table.id,
                                record: r.id,
                              })}
                              onGo={() =>
                                ctx.go({
                                  page: "table",
                                  table: table.id,
                                  record: r.id,
                                })
                              }
                            >
                              <Identity
                                name={name}
                                meta={`Added ${formatDate(r.createdAt)}`}
                              />
                            </GoLink>
                          </td>
                          {p.phone && (
                            <td data-label={p.phone.name}>
                              <span className="ow-mono">
                                {formatPhone(
                                  String(r.values[p.phone.id] ?? ""),
                                )}
                              </span>
                            </td>
                          )}
                          {p.email && (
                            <td data-label={p.email.name}>
                              {r.values[p.email.id] ? (
                                <span className="ow-muted">
                                  {String(r.values[p.email.id])}
                                </span>
                              ) : (
                                <span className="ow-subtle">—</span>
                              )}
                            </td>
                          )}
                          {extra.slice(0, 2).map((f) => (
                            <td key={f.id} data-label={f.name}>
                              {valueText(
                                ctx.model.app,
                                p,
                                f.id,
                                r,
                                ctx.linkTitle,
                              ) || <span className="ow-subtle">—</span>}
                            </td>
                          ))}
                          {total && (
                            <td
                              data-label={total.name}
                              className="ow-textRight"
                            >
                              <span className="ow-amount">
                                {total.money
                                  ? ctx.money(Number(r.totals?.[total.id] ?? 0))
                                  : Number(
                                      r.totals?.[total.id] ?? 0,
                                    ).toLocaleString("en-IN")}
                              </span>
                            </td>
                          )}
                          {link && (
                            <td data-label={goodName} className="ow-textRight">
                              {countIn(
                                historyOf(link, r.id, children),
                                link.workflow.good,
                              )}
                            </td>
                          )}
                          {p.paused && (
                            <td data-label="Status">
                              {paused ? (
                                <Badge tone="neutral">Inactive</Badge>
                              ) : (
                                <Badge tone="approved">Active</Badge>
                              )}
                            </td>
                          )}
                          <td data-label="Actions">
                            <div className="ow-rowActions">
                              <Dropdown
                                label={`Actions for ${name}`}
                                trigger={<Icon name="moreVertical" />}
                              >
                                {(close) => (
                                  <>
                                    <MenuItem
                                      icon="eye"
                                      onClick={() => {
                                        close();
                                        ctx.go({
                                          page: "table",
                                          table: table.id,
                                          record: r.id,
                                        });
                                      }}
                                    >
                                      View profile
                                    </MenuItem>
                                    <MenuItem
                                      icon="edit"
                                      onClick={() => {
                                        close();
                                        ctx.edit(r);
                                      }}
                                    >
                                      Edit details
                                    </MenuItem>
                                    <div className="ow-dropdownDivider" />
                                    <MenuItem
                                      icon="trash"
                                      danger
                                      onClick={() => {
                                        close();
                                        setDeleting(r);
                                      }}
                                    >
                                      {`Delete ${singular}`}
                                    </MenuItem>
                                  </>
                                )}
                              </Dropdown>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={shownPage}
                pageSize={pageSize}
                total={visible.length}
                onPage={setPage}
                onPageSize={(n) => {
                  setPageSize(n);
                  setPage(1);
                }}
              />
            </>
          )}
        </CardBody>
      </Card>

      {deleting && (
        <DeleteDialog
          p={p}
          record={deleting}
          onClose={() => setDeleting(undefined)}
        />
      )}
    </>
  );
}

/**
 * Deleting someone with history would break the reward record, so the
 * server refuses (409); the dialog says why and offers "Mark inactive".
 */
export function DeleteDialog({
  p,
  record,
  onClose,
  onDeleted,
}: {
  p: People;
  record: AppRecord;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const ctx = useOwner();
  const toast = useToast();
  const [blocked, setBlocked] = useState("");
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const table = p.table;
  const name = recordTitle(table, record);
  const phone = p.phone
    ? formatPhone(String(record.values[p.phone.id] ?? ""))
    : "";
  const linked = p.workflows.reduce(
    (n, l) =>
      n + historyOf(l, record.id, ctx.records(l.workflow.table.id)).length,
    0,
  );
  const historyNoun = p.workflows[0]?.workflow.noun ?? "linked record";

  const confirm = async () => {
    setFailure("");
    // Known history: refused here exactly as the server would refuse it.
    if (linked > 0) {
      setBlocked(
        `${name} has ${pluralise(linked, historyNoun)}, so they can't be deleted — their history would be lost. Mark them inactive instead.`,
      );
      return;
    }
    setBusy(true);
    try {
      await ctx.actions.deleteRecord(record);
      toast("success", `${table.singular} deleted`, name);
      onDeleted?.();
      onClose();
    } catch (error) {
      setBusy(false);
      if (error instanceof ApiError && error.status === 409)
        setBlocked(errorText(error, "This record has history."));
      else setFailure(errorText(error, "That didn't work. Try again."));
    }
  };
  const markInactive = async () => {
    if (!p.paused) return;
    setBusy(true);
    try {
      await ctx.actions.updateRecord(record, { [p.paused.id]: true });
      toast(
        "warning",
        "Marked inactive",
        "They can no longer record purchases.",
      );
      onClose();
    } catch (error) {
      setBusy(false);
      setFailure(errorText(error, "That didn't work. Try again."));
    }
  };

  return (
    <Modal
      title={`Delete ${name}?`}
      description={
        phone
          ? `This frees the number ${phone} for reuse.`
          : "This can't be undone."
      }
      urgent
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          {blocked && p.paused && !isPaused(p, record) && (
            <Button
              variant="secondary"
              loading={busy}
              onClick={() => void markInactive()}
            >
              Mark inactive
            </Button>
          )}
          <Button
            variant="danger"
            loading={busy && !blocked}
            disabled={!!blocked}
            onClick={() => void confirm()}
          >
            {`Delete ${table.singular.toLowerCase()}`}
          </Button>
        </>
      }
    >
      {blocked ? (
        <InlineAlert
          tone="danger"
          title={`This ${table.singular.toLowerCase()} has ${historyNoun}s`}
        >
          {blocked}
        </InlineAlert>
      ) : (
        <InlineAlert tone="warning">
          {`A ${table.singular.toLowerCase()} with recorded ${
            p.workflows[0]?.workflow.table.name.toLowerCase() ?? "history"
          } cannot be deleted — it would break the ${
            p.workflows[0]?.workflow.reward ? "reward " : ""
          }record.${p.paused ? " Marking them inactive stops them submitting instead." : ""}`}
        </InlineAlert>
      )}
      {failure && <InlineAlert tone="danger">{failure}</InlineAlert>}
    </Modal>
  );
}

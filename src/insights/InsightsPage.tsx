import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AppShell, PageHeading } from "../brand/AppShell";
import { useSession } from "../brand/useSession";
import { Icon } from "../studio/Icon";
import { request } from "../cloud/client";
import "../commerce/commerce.css";
import "./insights.css";

/** GET /sites/{id}/insights (backend/insights.ts). */
export interface Insights {
  days: number;
  from: string;
  to: string;
  currency: string;
  tracking: boolean;
  store: boolean;
  series: {
    day: string;
    visitors: number;
    views: number;
    orders: number;
    revenue: number;
  }[];
  totals: { visitors: number; views: number; orders: number; revenue: number };
  pages: [string, number][];
  referrers: [string, number][];
  sources: [string, number][];
  mediums: [string, number][];
  campaigns: [string, number][];
  devices: [string, number][];
  countries: [string, number][];
  /** A/B visits: "campaign:a" → visits. */
  variants: [string, number][];
  variantSales: Record<string, { orders: number; revenue: number }>;
  funnel: {
    visits: number;
    productViews: number;
    carts: number;
    checkouts: number;
    paid: number;
  };
  channels: {
    source: string;
    medium: string;
    campaign: string;
    orders: number;
    revenue: number;
  }[];
  abandoned: number;
}
const RANGES = [
  [7, "7 days"],
  [30, "30 days"],
  [90, "90 days"],
  [365, "12 months"],
] as const;
const number = (n: number) => n.toLocaleString();
const money = (minor: number, currency: string) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: minor % 100 ? 2 : 0,
  }).format(minor / 100);
const shortDay = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

/**
 * Insights: visitors, where they come from, what they read and what they
 * buy, for one site. Counts come from published pages (cookieless) and the
 * store; nothing here needs a third-party analytics account.
 */
export function InsightsPage({ siteId }: { siteId: string }) {
  const session = useSession();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Insights>();
  const [siteName, setSiteName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!session.account || !siteId) return;
    let live = true;
    Promise.all([
      request<Insights>(`/sites/${siteId}/insights?days=${days}`),
      siteName
        ? Promise.resolve(null)
        : request<{ site: { name: string } }>(`/sites/${siteId}`),
    ])
      .then(([result, site]) => {
        if (!live) return;
        setData(result);
        if (site) setSiteName(site.site.name);
        setError("");
      })
      .catch(
        (e) =>
          live &&
          setError(e instanceof Error ? e.message : "Couldn’t load insights."),
      )
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [session.account, siteId, days, siteName]);

  const conversion =
    data && data.totals.visitors
      ? (data.totals.orders / data.totals.visitors) * 100
      : 0;
  return (
    <AppShell
      area="insights"
      crumbs={[
        { label: "Workspace", href: "/workspace" },
        ...(siteName ? [{ label: siteName }] : []),
        { label: "Insights" },
      ]}
    >
      <div className="insights">
        <PageHeading
          kicker={siteName}
          title="Insights"
          description="Who visits, where they come from, and what they buy. No cookies, no banner."
          action={
            <div className="insights-range" role="group" aria-label="Period">
              {RANGES.map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={days === value}
                  onClick={() => {
                    if (value === days) return;
                    setLoading(true);
                    setDays(value);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          }
        />
        {!session.loading && !session.account && (
          <section className="commerce-panel commerce-empty insights-gate">
            <span className="insights-gate-icon">
              <Icon name="chart" size={20} />
            </span>
            <h2>Sign in to see your insights</h2>
            <p>Visits, sources and sales are private to your workspace.</p>
            <a className="commerce-button" href="/login">
              Sign in
            </a>
          </section>
        )}
        {session.account && !siteId && (
          <section className="commerce-panel commerce-empty insights-gate">
            <span className="insights-gate-icon">
              <Icon name="chart" size={20} />
            </span>
            <h2>Pick a website</h2>
            <p>Each website has its own visitors, sources and sales.</p>
            <a className="commerce-button" href="/workspace">
              Your websites
            </a>
          </section>
        )}
        {error && (
          <div className="commerce-notice error" role="alert">
            {error}
          </div>
        )}
        {data && !data.tracking && (
          <div className="commerce-notice">
            Visits aren’t being counted yet. Insights start when you publish
            with Forma insights on (editor → Settings → Tracking).{" "}
            <a
              className="commerce-link"
              href={`/editor?site=${encodeURIComponent(siteId)}`}
            >
              Open the editor
            </a>
          </div>
        )}
        {data && (
          <div
            className={loading ? "insights-body is-loading" : "insights-body"}
            aria-busy={loading}
          >
            <section
              className="commerce-stats insights-kpis"
              aria-label="Totals"
            >
              <Kpi
                label="Visitors"
                value={number(data.totals.visitors)}
                note={`${number(data.totals.views)} page views`}
                trend={data.series.map((d) => d.visitors)}
              />
              <Kpi
                label="Pages per visit"
                value={
                  data.totals.visitors
                    ? (data.totals.views / data.totals.visitors).toFixed(1)
                    : "—"
                }
                note="How far people read"
              />
              {data.store && (
                <Kpi
                  label="Orders"
                  value={number(data.totals.orders)}
                  note="Paid, in this period"
                  trend={data.series.map((d) => d.orders)}
                />
              )}
              {data.store && (
                <Kpi
                  label="Sales"
                  value={money(data.totals.revenue, data.currency)}
                  note={`${data.currency} orders`}
                  trend={data.series.map((d) => d.revenue)}
                />
              )}
              {data.store && (
                <Kpi
                  label="Conversion"
                  value={
                    data.totals.visitors
                      ? `${conversion.toFixed(conversion < 10 ? 1 : 0)}%`
                      : "—"
                  }
                  note="Visitors who bought"
                />
              )}
            </section>
            <div className={data.store ? "insights-charts" : undefined}>
              <section className="commerce-panel">
                <PanelHead
                  title="Visitors"
                  note="Unique visitors each day."
                  total={number(data.totals.visitors)}
                />
                <LineChart
                  points={data.series.map((d) => ({
                    label: d.day,
                    value: d.visitors,
                  }))}
                  format={(v) =>
                    `${number(v)} ${v === 1 ? "visitor" : "visitors"}`
                  }
                />
                <DataTable
                  caption="Visitors and page views by day"
                  headings={["Day", "Visitors", "Page views"]}
                  rows={data.series.map((d) => [
                    shortDay(d.day),
                    number(d.visitors),
                    number(d.views),
                  ])}
                />
              </section>
              {data.store && (
                <section className="commerce-panel">
                  <PanelHead
                    title="Sales"
                    note={`Paid ${data.currency} orders each day.`}
                    total={money(data.totals.revenue, data.currency)}
                  />
                  <BarChart
                    points={data.series.map((d) => ({
                      label: d.day,
                      value: d.revenue,
                      extra: d.orders,
                    }))}
                    format={(v, orders) =>
                      `${money(v, data.currency)} · ${number(orders ?? 0)} ${orders === 1 ? "order" : "orders"}`
                    }
                  />
                  <DataTable
                    caption="Sales by day"
                    headings={["Day", "Orders", "Sales"]}
                    rows={data.series.map((d) => [
                      shortDay(d.day),
                      number(d.orders),
                      money(d.revenue, data.currency),
                    ])}
                  />
                </section>
              )}
            </div>
            {data.store && (
              <Funnel
                funnel={data.funnel}
                abandoned={data.abandoned}
                siteId={siteId}
              />
            )}
            <div className="insights-grid">
              <Ranked
                title="Top pages"
                note="Page views"
                rows={data.pages}
                empty="No page views yet."
              />
              <Ranked
                title="Where visitors come from"
                note="Visits by referring site"
                rows={data.referrers}
                label={(r) => (r === "(direct)" ? "Direct or unknown" : r)}
                empty="No visits yet."
              />
              <Ranked
                title="Campaigns"
                note="Visits from links with utm_campaign"
                rows={data.campaigns}
                empty="Tag your links with the builder below to see campaigns here."
              />
              <Ranked
                title="Sources"
                note="Visits by utm_source, Google Ads and Meta clicks"
                rows={data.sources}
                empty="No tagged visits yet."
              />
              <Ranked
                title="Devices"
                note="Visits by screen size"
                rows={data.devices}
                label={(d) => d[0].toUpperCase() + d.slice(1)}
                empty="No visits yet."
              />
              <Ranked
                title="Countries"
                note="Visits, from the visitor’s time zone"
                rows={data.countries}
                label={countryName}
                empty="No visits yet."
              />
            </div>
            {data.store && (
              <section className="commerce-panel">
                <h2>Sales by channel</h2>
                <p className="commerce-muted">
                  Which campaigns and sites the buyers came from. A sale counts
                  for the link the shopper arrived with.
                </p>
                {data.channels.length ? (
                  <div className="commerce-scroll">
                    <table className="commerce-table">
                      <thead>
                        <tr>
                          <th>Source</th>
                          <th>Medium</th>
                          <th>Campaign</th>
                          <th className="num">Orders</th>
                          <th className="num">Sales</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.channels.map((c) => (
                          <tr key={`${c.source}|${c.medium}|${c.campaign}`}>
                            <td>
                              <strong>
                                {c.source === "direct" ? "Direct" : c.source}
                              </strong>
                            </td>
                            <td>{c.medium || "—"}</td>
                            <td>{c.campaign || "—"}</td>
                            <td className="num">{number(c.orders)}</td>
                            <td className="num">
                              {money(c.revenue, data.currency)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="commerce-muted">
                    No paid orders in this period.
                  </p>
                )}
              </section>
            )}
            <AbTests data={data} />
            <LinkBuilder siteId={siteId} />
          </div>
        )}
        {loading && !data && !error && session.account && siteId && (
          <div className="insights-skeleton" role="status">
            <span className="sr-only">Loading insights…</span>
            <i className="is-strip" />
            <div>
              <i />
              <i />
            </div>
            <i className="is-wide" />
          </div>
        )}
      </div>
    </AppShell>
  );
}

const regions = (() => {
  try {
    return new Intl.DisplayNames(undefined, { type: "region" });
  } catch {
    return undefined;
  }
})();
const countryName = (code: string) =>
  code === "unknown" ? "Not detected" : (regions?.of(code) ?? code);

/** A/B campaigns: visits and sales for each subject line. */
function AbTests({ data }: { data: Insights }) {
  const campaigns = new Map<string, { a: number; b: number }>();
  for (const [id, visits] of data.variants) {
    const name = id.slice(0, -2),
      variant = id.slice(-1);
    const row = campaigns.get(name) ?? { a: 0, b: 0 };
    if (variant === "a" || variant === "b") row[variant] = visits;
    campaigns.set(name, row);
  }
  for (const id of Object.keys(data.variantSales))
    if (!campaigns.has(id.slice(0, -2)))
      campaigns.set(id.slice(0, -2), { a: 0, b: 0 });
  if (!campaigns.size) return null;
  const sales = (name: string, v: "a" | "b") =>
    data.variantSales[`${name}:${v}`] ?? { orders: 0, revenue: 0 };
  return (
    <section className="commerce-panel">
      <h2>A/B tests</h2>
      <p className="commerce-muted">
        Campaigns sent with two subject lines: which one brought more visits and
        sales.
      </p>
      <div className="commerce-scroll">
        <table className="commerce-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Version</th>
              <th className="num">Visits</th>
              <th className="num">Orders</th>
              <th className="num">Sales</th>
            </tr>
          </thead>
          <tbody>
            {[...campaigns].flatMap(([name, visits]) => {
              // Sales decide; visits break a tie.
              const score = (v: "a" | "b") =>
                sales(name, v).revenue * 1000 + visits[v];
              const winner =
                score("a") === score("b")
                  ? ""
                  : score("a") > score("b")
                    ? "a"
                    : "b";
              return (["a", "b"] as const).map((v) => (
                <tr key={`${name}:${v}`}>
                  <td>{v === "a" ? <strong>{name}</strong> : ""}</td>
                  <td>
                    {v.toUpperCase()}{" "}
                    {winner === v && (
                      <span className="commerce-badge">Ahead</span>
                    )}
                  </td>
                  <td className="num">{number(visits[v])}</td>
                  <td className="num">{number(sales(name, v).orders)}</td>
                  <td className="num">
                    {money(sales(name, v).revenue, data.currency)}
                  </td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function Kpi({
  label,
  value,
  note,
  trend,
}: {
  label: string;
  value: string;
  note: string;
  /** Daily values for a small line under the number. */
  trend?: number[];
}) {
  return (
    <div className="commerce-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
      {trend && trend.filter(Boolean).length > 1 && (
        <Sparkline values={trend} />
      )}
    </div>
  );
}
/** useId without the punctuation that breaks url(#…) references. */
const useSvgId = () => `g${useId().replace(/[^\w-]/g, "")}`;
function Sparkline({ values }: { values: number[] }) {
  const id = useSvgId();
  const max = Math.max(...values, 1);
  const w = 100,
    h = 28;
  const line = values
    .map(
      (v, i) =>
        `${i ? "L" : "M"}${((i / (values.length - 1)) * w).toFixed(2)},${(h - 2 - (v / max) * (h - 4)).toFixed(2)}`,
    )
    .join("");
  return (
    <svg
      className="insights-spark"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L${w},${h}L0,${h}Z`} fill={`url(#${id})`} />
      <path d={line} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
/** A chart card's title and note, with the period's total on the right. */
function PanelHead({
  title,
  note,
  total,
}: {
  title: string;
  note: string;
  total: string;
}) {
  return (
    <header className="insights-head">
      <div>
        <h2>{title}</h2>
        <p className="commerce-muted">{note}</p>
      </div>
      <strong>{total}</strong>
    </header>
  );
}
function DataTable({
  caption,
  headings,
  rows,
}: {
  caption: string;
  headings: string[];
  rows: string[][];
}) {
  return (
    <details className="insights-table">
      <summary>Show as a table</summary>
      <div className="commerce-scroll">
        <table className="commerce-table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {headings.map((h, i) => (
                <th key={h} className={i ? "num" : undefined}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r[0]}>
                {r.map((cell, i) => (
                  <td key={i} className={i ? "num" : undefined}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Charts draw at their container's real width, so text stays 11px. */
const H = 200,
  PAD = { top: 12, right: 8, bottom: 26, left: 40 };
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(280, Math.round(entry.contentRect.width))),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}
/** Round axis maximum and its ticks. */
function scale(max: number) {
  if (max <= 0) return { top: 4, ticks: [0, 2, 4] };
  const step = 10 ** Math.floor(Math.log10(max));
  const top =
    [1, 2, 2.5, 5, 10].map((m) => m * step).find((t) => t >= max) ?? max;
  return { top, ticks: [0, top / 2, top] };
}
/** Where each of `count` points sits across a chart `w` wide. */
const xAt = (w: number, count: number, i: number) =>
  PAD.left +
  (count <= 1
    ? (w - PAD.left - PAD.right) / 2
    : (i / (count - 1)) * (w - PAD.left - PAD.right));
const yAt = (top: number, v: number) =>
  PAD.top + (1 - v / top) * (H - PAD.top - PAD.bottom);
function useHover(w: number, count: number) {
  const ref = useRef<SVGSVGElement>(null);
  const [at, setAt] = useState<number | null>(null);
  const move = (clientX: number) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || !count) return;
    const x = ((clientX - box.left) / box.width) * w;
    const i = Math.round(
      ((x - PAD.left) / (w - PAD.left - PAD.right)) * (count - 1),
    );
    setAt(Math.max(0, Math.min(count - 1, i)));
  };
  return { ref, at, setAt, move };
}
function Axis({
  w,
  top,
  ticks,
  format,
  labels,
  xOf,
}: {
  w: number;
  top: number;
  ticks: number[];
  format: (v: number) => string;
  labels: string[];
  /** Where label i sits (bar charts centre labels in each bar's slot). */
  xOf?: (i: number) => number;
}) {
  const place = xOf ?? ((i: number) => xAt(w, labels.length, i));
  const every = Math.max(
    1,
    Math.ceil(labels.length / Math.max(2, Math.floor(w / 110))),
  );
  return (
    <g className="insights-axis" aria-hidden="true">
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={PAD.left}
            x2={w - PAD.right}
            y1={yAt(top, t)}
            y2={yAt(top, t)}
          />
          <text x={PAD.left - 8} y={yAt(top, t) + 4} textAnchor="end">
            {format(t)}
          </text>
        </g>
      ))}
      {labels.map((l, i) =>
        i % every === 0 ? (
          <text key={l} x={place(i)} y={H - 6} textAnchor="middle">
            {shortDay(l)}
          </text>
        ) : null,
      )}
    </g>
  );
}
const compact = (v: number) =>
  new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(v);

function Tooltip({
  x,
  w,
  children,
}: {
  x: number;
  w: number;
  children: ReactNode;
}) {
  // Kept inside the chart near its edges.
  const left = Math.min(Math.max(x, 70), w - 70);
  return (
    <div className="insights-tooltip" style={{ left }} role="status">
      {children}
    </div>
  );
}
function LineChart({
  points,
  format,
}: {
  points: { label: string; value: number }[];
  format: (v: number) => string;
}) {
  const { ref: box, width: w } = useWidth();
  const { top, ticks } = scale(Math.max(...points.map((p) => p.value), 0));
  const { ref, at, setAt, move } = useHover(w, points.length);
  const x = (i: number) => xAt(w, points.length, i);
  const line = points
    .map(
      (p, i) =>
        `${i ? "L" : "M"}${x(i).toFixed(1)},${yAt(top, p.value).toFixed(1)}`,
    )
    .join("");
  const area = `${line}L${x(points.length - 1)},${yAt(top, 0)}L${x(0)},${yAt(top, 0)}Z`;
  const fill = useSvgId();
  return (
    <div className="insights-chart" ref={box}>
      <svg
        ref={ref}
        width={w}
        height={H}
        viewBox={`0 0 ${w} ${H}`}
        role="img"
        aria-label={`Line chart of visitors per day, highest ${number(Math.max(...points.map((p) => p.value), 0))}`}
        onPointerMove={(e) => move(e.clientX)}
        onPointerLeave={() => setAt(null)}
      >
        <Axis
          w={w}
          top={top}
          ticks={ticks}
          format={compact}
          labels={points.map((p) => p.label)}
        />
        <defs>
          <linearGradient id={fill} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" className="insights-area-top" />
            <stop offset="1" className="insights-area-bottom" />
          </linearGradient>
        </defs>
        <path className="insights-area" d={area} fill={`url(#${fill})`} />
        <path className="insights-line" d={line} />
        {at !== null && (
          <g>
            <line
              className="insights-crosshair"
              x1={x(at)}
              x2={x(at)}
              y1={PAD.top}
              y2={H - PAD.bottom}
            />
            <circle
              className="insights-dot"
              cx={x(at)}
              cy={yAt(top, points[at].value)}
              r={5}
            />
          </g>
        )}
      </svg>
      {at !== null && (
        <Tooltip x={x(at)} w={w}>
          <small>{shortDay(points[at].label)}</small>
          <strong>{format(points[at].value)}</strong>
        </Tooltip>
      )}
    </div>
  );
}
function BarChart({
  points,
  format,
}: {
  points: { label: string; value: number; extra?: number }[];
  format: (v: number, extra?: number) => string;
}) {
  const { ref: box, width: w } = useWidth();
  const { top, ticks } = scale(Math.max(...points.map((p) => p.value), 0));
  const { ref, at, setAt, move } = useHover(w, points.length);
  const slot = (w - PAD.left - PAD.right) / Math.max(1, points.length);
  // A 2px gap between neighbours, never wider than 28px.
  const width = Math.max(2, Math.min(28, slot - 2));
  const base = yAt(top, 0);
  const center = (i: number) => PAD.left + slot * (i + 0.5);
  return (
    <div className="insights-chart" ref={box}>
      <svg
        ref={ref}
        width={w}
        height={H}
        viewBox={`0 0 ${w} ${H}`}
        role="img"
        aria-label="Bar chart of sales per day"
        onPointerMove={(e) => move(e.clientX)}
        onPointerLeave={() => setAt(null)}
      >
        <Axis
          w={w}
          top={top}
          ticks={ticks}
          format={(v) => compact(v / 100)}
          labels={points.map((p) => p.label)}
          xOf={center}
        />
        {points.map((p, i) => {
          const y = yAt(top, p.value);
          const h = base - y;
          if (h <= 0) return null;
          const r = Math.min(4, width / 2, h);
          const left = center(i) - width / 2;
          // Rounded at the data end only, square on the baseline.
          return (
            <path
              key={p.label}
              className={at === i ? "insights-bar is-active" : "insights-bar"}
              d={`M${left},${base}V${y + r}Q${left},${y} ${left + r},${y}H${left + width - r}Q${left + width},${y} ${left + width},${y + r}V${base}Z`}
            />
          );
        })}
      </svg>
      {at !== null && (
        <Tooltip x={center(at)} w={w}>
          <small>{shortDay(points[at].label)}</small>
          <strong>{format(points[at].value, points[at].extra)}</strong>
        </Tooltip>
      )}
    </div>
  );
}
function Ranked({
  title,
  note,
  rows,
  label = (v) => v,
  empty,
}: {
  title: string;
  note: string;
  rows: [string, number][];
  label?: (v: string) => string;
  empty: string;
}) {
  const max = Math.max(...rows.map((r) => r[1]), 1);
  const total = rows.reduce((n, r) => n + r[1], 0) || 1;
  return (
    <section className="commerce-panel insights-ranked">
      <h2>{title}</h2>
      <p className="commerce-muted">{note}</p>
      {rows.length ? (
        <ol>
          {rows.map(([name, value]) => (
            <li key={name} title={`${label(name)}: ${number(value)}`}>
              <span className="insights-ranked-name">{label(name)}</span>
              <span className="insights-ranked-share">
                {Math.round((value / total) * 100)}%
              </span>
              <strong>{number(value)}</strong>
              <span className="insights-ranked-track" aria-hidden="true">
                <span style={{ width: `${(value / max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="insights-empty">{empty}</p>
      )}
    </section>
  );
}
function Funnel({
  funnel,
  abandoned,
  siteId,
}: {
  funnel: Insights["funnel"];
  abandoned: number;
  siteId: string;
}) {
  const steps: [string, number][] = [
    ["Store visits", funnel.visits],
    ["Viewed a product", funnel.productViews],
    ["Started a cart", funnel.carts],
    ["Began checkout", funnel.checkouts],
    ["Paid", funnel.paid],
  ];
  const max = Math.max(...steps.map((s) => s[1]), 1);
  return (
    <section className="commerce-panel insights-funnel">
      <PanelHead
        title="Store funnel"
        note="Where shoppers drop off, and the share who carry on at each step."
        total={
          funnel.visits
            ? `${Math.round((funnel.paid / funnel.visits) * 100)}% paid`
            : "—"
        }
      />
      <ol>
        {steps.map(([name, value], i) => {
          const before = i ? steps[i - 1][1] : 0;
          return (
            <li key={name} title={`${name}: ${number(value)}`}>
              <span className="insights-funnel-name">{name}</span>
              <strong>{number(value)}</strong>
              <span className="insights-funnel-rate">
                {i === 0
                  ? "Start"
                  : before
                    ? `${Math.round((value / before) * 100)}% of previous`
                    : "—"}
              </span>
              <span className="insights-funnel-bar" aria-hidden="true">
                <span style={{ "--share": value / max } as CSSProperties} />
              </span>
            </li>
          );
        })}
      </ol>
      {abandoned > 0 && (
        <p className="insights-funnel-note">
          <Icon name="mail" size={14} />
          {number(abandoned)} {abandoned === 1 ? "checkout" : "checkouts"} ran
          out unpaid.
          <a
            className="commerce-link"
            href={`/commerce?site=${encodeURIComponent(siteId)}&section=marketing`}
          >
            Remind them
          </a>
        </p>
      )}
    </section>
  );
}

/** Builds a campaign link (utm_*) for ads, posts and emails. */
function LinkBuilder({ siteId }: { siteId: string }) {
  const [base, setBase] = useState("");
  const [source, setSource] = useState("instagram");
  const [medium, setMedium] = useState("social");
  const [campaign, setCampaign] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!siteId) return;
    request<{ site: { url?: string } }>(`/sites/${siteId}`)
      .then((r) =>
        setBase(
          (b) => b || r.site.url || `${location.origin}/store?site=${siteId}`,
        ),
      )
      .catch(() =>
        setBase((b) => b || `${location.origin}/store?site=${siteId}`),
      );
  }, [siteId]);
  const link = useMemo(() => {
    try {
      const url = new URL(base);
      const tag = (v: string) => v.trim().toLowerCase().replace(/\s+/g, "-");
      if (source) url.searchParams.set("utm_source", tag(source));
      if (medium) url.searchParams.set("utm_medium", tag(medium));
      if (campaign) url.searchParams.set("utm_campaign", tag(campaign));
      return url.toString();
    } catch {
      return "";
    }
  }, [base, source, medium, campaign]);
  return (
    <section className="commerce-panel insights-builder">
      <h2>Campaign link builder</h2>
      <p className="commerce-muted">
        Use these links in ads, posts and emails. Their visits and sales show up
        under Campaigns and Sales by channel.
      </p>
      <div className="insights-builder-fields">
        <label className="commerce-field">
          Page or product address
          <input
            value={base}
            onChange={(e) => setBase(e.target.value)}
            placeholder="https://yourshop.com/products/…"
          />
        </label>
        <label className="commerce-field">
          Source
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            list="insights-sources"
          />
        </label>
        <label className="commerce-field">
          Medium
          <input
            value={medium}
            onChange={(e) => setMedium(e.target.value)}
            list="insights-mediums"
          />
        </label>
        <label className="commerce-field">
          Campaign
          <input
            value={campaign}
            onChange={(e) => setCampaign(e.target.value)}
            placeholder="diwali-sale"
          />
        </label>
        <datalist id="insights-sources">
          {[
            "instagram",
            "facebook",
            "google",
            "whatsapp",
            "newsletter",
            "youtube",
            "linkedin",
          ].map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <datalist id="insights-mediums">
          {["social", "cpc", "email", "referral", "sms", "affiliate"].map(
            (s) => (
              <option key={s} value={s} />
            ),
          )}
        </datalist>
      </div>
      <div className="insights-builder-result">
        <code>{link || "Enter a full address starting with https://"}</code>
        <button
          className="commerce-button"
          disabled={!link}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              setCopied(false);
            }
          }}
        >
          <Icon name={copied ? "check" : "copy"} size={14} />
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </section>
  );
}

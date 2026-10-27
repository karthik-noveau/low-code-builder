/**
 * Prebuilt interactive sections (category "interactive" in ../presets.ts),
 * made from clicks, "show only when" rules and page values: tabs, a monthly /
 * yearly price switch, a "Book now" button opening a booking form, an
 * announcement visitors can dismiss, a limited-time offer and a WhatsApp
 * contact card. Page values a section uses come with it (`variables`); the
 * studio renames them if the page already has one of the same name.
 */
import { createNode } from "../registry";
import type { Node, NodeType, Props, Style } from "../model";
import type { Preset } from "../presets";
import { today, type Action, type Condition } from "./model";

function n(
  type: NodeType,
  props: Props = {},
  style?: Style,
  children?: Node[],
): Node {
  const node = createNode(type, props);
  if (style) node.style = { ...node.style, ...style };
  if (children) node.children = children;
  return node;
}
const section = (children: Node[], style: Style = {}, props: Props = {}) => {
  const s = n(
    "section",
    props,
    { padding: [80, 24, 80, 24], gap: 32, ...style },
    children,
  );
  s.mobile = { padding: [56, 16, 56, 16], gap: 24 };
  return s;
};
const text = (value: string, variant = "body", style?: Style) =>
  n("text", { text: value, variant }, style);
const heading = (value: string, level = "2", style?: Style) =>
  n("heading", { text: value, level }, style);
const box = (children: Node[], style: Style = {}, props: Props = {}) =>
  n("box", { variant: "plain", ...props }, style, children);
const row = (children: Node[], style: Style = {}) =>
  n("row", {}, style, children);
function intro(eyebrow: string, title: string, lead: string) {
  return box([text(eyebrow, "eyebrow"), heading(title), text(lead, "lead")], {
    gap: 12,
    maxWidth: 640,
    textAlign: "center",
    align: "center",
  });
}
/** A block that does something when clicked. */
function clicks(node: Node, ...actions: Action[]): Node {
  node.on = { click: actions };
  return node;
}
/** A block shown only when… */
function when(node: Node, cond: Condition): Node {
  node.when = cond;
  return node;
}
const is = (name: string, value: string): Condition => ({
  match: "all",
  rules: [{ if: "var", name, op: "is", value }],
});
const plus = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return today(d);
};

/** Three tabs: buttons set "tab", each panel shows for its tab. */
function tabs(): Node {
  const panel = (value: string, title: string, body: string, items: string[]) =>
    when(
      box(
        [
          heading(title, "3", { fontSize: "xl" }),
          text(body, "body", { color: "muted" }),
          n("list", { items, marker: "check" }, { gap: 10 }),
        ],
        { gap: 14, padding: [28, 28, 28, 28], width: "full" },
        { variant: "card" },
      ),
      is("tab", value),
    );
  const tab = (value: string, label: string) =>
    clicks(n("button", { label, variant: "secondary", size: "sm", url: "" }), {
      do: "setVar",
      name: "tab",
      value,
    });
  return section(
    [
      intro(
        "What we do",
        "Everything in *one place*",
        "Pick a tab to see the details.",
      ),
      box(
        [
          row(
            [
              tab("services", "Services"),
              tab("prices", "Prices"),
              tab("hours", "Hours"),
            ],
            {
              gap: 6,
              justify: "center",
              padding: [6, 6, 6, 6],
              radius: "full",
              background: "surface",
              borderWidth: 1,
              borderColor: "line",
              wrap: false,
            },
          ),
          panel(
            "services",
            "Services",
            "Home visits and in-store appointments, six days a week.",
            ["Haircut and styling", "Facials and skin care", "Bridal packages"],
          ),
          panel(
            "prices",
            "Prices",
            "Clear prices, no surprises. Taxes included.",
            ["Haircut from ₹299", "Facial from ₹899", "Bridal from ₹9,999"],
          ),
          panel(
            "hours",
            "Hours",
            "Walk in any time, or book ahead to skip the wait.",
            ["Mon–Fri 10 am – 8 pm", "Saturday 9 am – 9 pm", "Sunday closed"],
          ),
        ],
        { gap: 20, align: "center", maxWidth: 720, width: "full" },
      ),
    ],
    { align: "center" },
  );
}

/** Monthly / yearly: one switch, each card shows the price for the choice. */
function pricingToggle(): Node {
  const choice = (value: string, label: string) =>
    clicks(n("button", { label, variant: "secondary", size: "sm", url: "" }), {
      do: "setVar",
      name: "billing",
      value,
    });
  const price = (value: string, amount: string, per: string, note: string) =>
    when(
      box(
        [
          row(
            [
              text(amount, "body", {
                fontSize: "3xl",
                fontWeight: 700,
                font: "heading",
                lineHeight: 1,
              }),
              text(per, "muted", { padding: [0, 0, 4, 0] }),
            ],
            { gap: 6, align: "end", wrap: false },
          ),
          text(note, "small", { color: "muted" }),
        ],
        { gap: 6 },
      ),
      is("billing", value),
    );
  const plan = (
    name: string,
    blurb: string,
    monthly: string,
    yearly: string,
    items: string[],
    featured = false,
  ) =>
    box(
      [
        row(
          [
            heading(name, "3"),
            ...(featured
              ? [n("badge", { text: "Most popular", variant: "solid" })]
              : []),
          ],
          { justify: "between", wrap: false },
        ),
        text(blurb, "muted"),
        price("monthly", monthly, "/ month", "Billed every month"),
        price("yearly", yearly, "/ month", "Billed once a year"),
        n("divider"),
        n("list", { items, marker: "check" }, { gap: 12 }),
        n(
          "button",
          {
            label: `Choose ${name}`,
            url: "/contact",
            variant: featured ? "primary" : "secondary",
          },
          { width: "full" },
        ),
      ],
      {
        gap: 16,
        padding: [32, 28, 28, 28],
        ...(featured
          ? { borderWidth: 2, borderColor: "accent", shadow: "lg" }
          : {}),
      },
      { variant: "card" },
    );
  const grid = n("grid", {}, { columns: 3, gap: 24 }, [
    plan("Basic", "For trying us out.", "₹499", "₹399", [
      "One visit a month",
      "Standard products",
      "Support on WhatsApp",
    ]),
    plan(
      "Standard",
      "Our most loved plan.",
      "₹999",
      "₹799",
      ["Two visits a month", "Premium products", "Priority booking"],
      true,
    ),
    plan("Premium", "For regulars.", "₹1,999", "₹1,599", [
      "Four visits a month",
      "Home visits",
      "20% off add-ons",
    ]),
  ]);
  grid.tablet = { columns: 1 };
  return section(
    [
      intro(
        "Pricing",
        "Pay monthly, or *save 20%*",
        "Switch to yearly billing and get two months free.",
      ),
      row(
        [choice("monthly", "Monthly"), choice("yearly", "Yearly · save 20%")],
        {
          gap: 6,
          padding: [6, 6, 6, 6],
          radius: "full",
          background: "surface",
          borderWidth: 1,
          borderColor: "line",
          wrap: false,
        },
      ),
      grid,
    ],
    { align: "center" },
  );
}

/** A call to action whose button opens a booking form in a dialog. */
function bookNow(): Node {
  const field = (id: string, props: Props = {}) =>
    n("field", { field: id, ...props });
  const form = n("form", { form: "", recipe: "booking" }, { gap: 16 }, [
    field("name"),
    field("phone", { hint: "We’ll call or WhatsApp to confirm." }),
    field("service", { display: "chips" }),
    field("date", { width: "half" }),
    field("time", { width: "half" }),
    n("formError", {}, undefined, [text("{message}", "small")]),
    n("submit", {
      label: "Request booking",
      action: "submit",
      icon: "check",
      full: true,
      size: "lg",
    }),
    n(
      "formSuccess",
      {},
      { align: "center", textAlign: "center", gap: 12, padding: [8, 0, 8, 0] },
      [
        n("icon", { icon: "check", variant: "circle", size: 26 }),
        heading("Booking requested", "3", { fontSize: "xl" }),
        text("{message}", "body", { color: "muted" }),
        clicks(n("button", { label: "Done", variant: "secondary", url: "" }), {
          do: "closeDialog",
        }),
      ],
    ),
  ]);
  const dialog = n(
    "dialog",
    { title: "Book a visit", kind: "modal", size: "md" },
    { gap: 18 },
    [
      text("Pick a time that suits you. We’ll confirm by phone.", "body", {
        color: "muted",
      }),
      form,
    ],
  );
  dialog.name = "Booking dialog";
  return section(
    [
      heading("Ready when *you are*", "2", { maxWidth: 640 }),
      text(
        "Book a visit in under a minute. No account, no payment now.",
        "lead",
        {
          maxWidth: 560,
        },
      ),
      row(
        [
          clicks(
            n("button", {
              label: "Book now",
              size: "lg",
              icon: "calendar",
              url: "",
            }),
            { do: "openDialog", dialog: dialog.id },
          ),
        ],
        { justify: "center" },
      ),
      dialog,
    ],
    { align: "center", textAlign: "center", gap: 20 },
    { tone: "soft" },
  );
}

/** A thin bar visitors can close (remembered on their device). */
function announcement(): Node {
  const close = clicks(n("icon", { icon: "x", variant: "plain", size: 18 }), {
    do: "setVar",
    name: "notice_closed",
    value: "yes",
  });
  close.name = "Close the announcement";
  const s = n(
    "section",
    { tone: "accent" },
    { padding: [12, 20, 12, 20], gap: 0 },
    [
      row(
        [
          row(
            [
              n("icon", { icon: "truck", variant: "plain", size: 18 }),
              text("Free delivery this week on orders over ₹999.", "small", {
                fontWeight: 600,
              }),
              n("button", {
                label: "Shop now",
                url: "/",
                variant: "link",
                size: "sm",
              }),
            ],
            { gap: 10, justify: "center", wrap: true },
          ),
          close,
        ],
        { justify: "between", gap: 12, wrap: false },
      ),
    ],
  );
  s.when = is("notice_closed", "no");
  return s;
}

/** An offer shown between two dates, with a code to copy. */
function offer(): Node {
  const s = section(
    [
      box(
        [
          n("badge", {
            text: "This week only",
            icon: "calendar",
            variant: "solid",
          }),
          heading("Festive offer: *20% off* everything", "2", {
            maxWidth: 640,
          }),
          text(
            "Use the code at checkout or show it in store. Ends soon.",
            "lead",
            { maxWidth: 520 },
          ),
          row(
            [
              text("DIWALI20", "body", {
                fontWeight: 700,
                letterSpacing: 2,
                font: "heading",
                padding: [10, 20, 10, 20],
                radius: "theme",
                borderWidth: 2,
                borderColor: "accent",
              }),
              clicks(
                n("button", { label: "Copy code", icon: "copy", url: "" }),
                { do: "copy", text: "DIWALI20", toast: "Code copied" },
              ),
            ],
            { justify: "center", gap: 12 },
          ),
        ],
        { gap: 16, align: "center", textAlign: "center" },
      ),
    ],
    { align: "center" },
    { tone: "soft" },
  );
  s.when = {
    match: "all",
    rules: [{ if: "date", from: today(), to: plus(14) }],
  };
  return s;
}

/** A contact card: WhatsApp with a message ready, or a call. */
function whatsapp(): Node {
  return section(
    [
      box(
        [
          n("icon", { icon: "message", variant: "circle", size: 26 }),
          heading("Questions? *Chat with us*", "2", { fontSize: "2xl" }),
          text(
            "We reply on WhatsApp within minutes, 9 am to 9 pm, every day.",
            "body",
            { color: "muted", maxWidth: 460 },
          ),
          row(
            [
              clicks(
                n("button", {
                  label: "Chat on WhatsApp",
                  icon: "message",
                  size: "lg",
                  url: "",
                }),
                {
                  do: "whatsapp",
                  phone: "+91 98000 00000",
                  text: "Hi! I have a question.",
                },
              ),
              clicks(
                n("button", {
                  label: "Call us",
                  icon: "phone",
                  variant: "secondary",
                  size: "lg",
                  url: "",
                }),
                { do: "call", phone: "+91 98000 00000" },
              ),
            ],
            { justify: "center", gap: 12 },
          ),
        ],
        {
          gap: 14,
          align: "center",
          textAlign: "center",
          padding: [40, 32, 40, 32],
          maxWidth: 640,
          width: "full",
        },
        { variant: "card" },
      ),
    ],
    { align: "center" },
  );
}

export const LOGIC_PRESETS: Preset[] = [
  {
    id: "logic-tabs",
    name: "Tabs",
    category: "interactive",
    description: "Three tabs; each shows its own panel",
    build: tabs,
    variables: () => [{ name: "tab", type: "text", value: "services" }],
  },
  {
    id: "logic-pricing-toggle",
    name: "Prices, monthly or yearly",
    category: "interactive",
    description: "Plans with a switch between monthly and yearly prices",
    build: pricingToggle,
    variables: () => [{ name: "billing", type: "text", value: "monthly" }],
  },
  {
    id: "logic-book-now",
    name: "Book now, form in a pop-up",
    category: "interactive",
    description: "A button that opens a booking form in a dialog",
    build: bookNow,
  },
  {
    id: "logic-announcement",
    name: "Announcement, can be closed",
    category: "interactive",
    description: "A thin bar visitors can close; it stays closed for them",
    build: announcement,
    variables: () => [
      { name: "notice_closed", type: "yesno", value: "no", remember: true },
    ],
  },
  {
    id: "logic-offer",
    name: "Limited-time offer",
    category: "interactive",
    description: "Shown only between two dates, with a code to copy",
    build: offer,
  },
  {
    id: "logic-whatsapp",
    name: "WhatsApp contact",
    category: "interactive",
    description: "Chat on WhatsApp with a message ready, or call",
    build: whatsapp,
  },
];

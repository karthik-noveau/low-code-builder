/**
 * Prebuilt form sections (category "forms" in ../presets.ts): contact,
 * booking (two steps), order, registration, feedback and order tracking.
 * Each form block carries a `recipe` (recipes.ts): when the section lands on
 * the page, the studio adds the table and form it needs to the business app
 * (making the app if there isn't one), so the form works when published.
 */
import { REF_KEY } from "../../apps/model";
import { createNode } from "../registry";
import type { Node, NodeType, Props, Style } from "../model";
import type { Preset } from "../presets";

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
const section = (children: Node[], style: Style = {}) => {
  const s = n(
    "section",
    {},
    { padding: [88, 24, 88, 24], gap: 40, ...style },
    children,
  );
  s.mobile = { padding: [56, 16, 56, 16], gap: 28 };
  return s;
};
const text = (value: string, variant = "body", style?: Style) =>
  n("text", { text: value, variant }, style);
const heading = (value: string, level = "2", style?: Style) =>
  n("heading", { text: value, level }, style);
function intro(
  eyebrow: string,
  title: string,
  lead: string,
  align: "center" | "left" = "center",
) {
  return n(
    "box",
    { variant: "plain" },
    { gap: 12, maxWidth: 640, textAlign: align },
    [text(eyebrow, "eyebrow"), heading(title), text(lead, "lead")],
  );
}
const field = (id: string, props: Props = {}) =>
  n("field", { field: id, ...props });
const send = (label: string, props: Props = {}) =>
  n("submit", {
    label,
    action: "submit",
    icon: "arrow",
    full: true,
    size: "lg",
    ...props,
  });
const failed = () =>
  n("formError", {}, undefined, [text("{message}", "small")]);
const done = (title: string, again: string) =>
  n(
    "formSuccess",
    {},
    { align: "center", textAlign: "center", gap: 12, padding: [16, 0, 16, 0] },
    [
      n("icon", { icon: "check", variant: "circle", size: 26 }),
      heading(title, "3", { fontSize: "xl" }),
      text("{message}", "body", { color: "muted" }),
      n("submit", { label: again, action: "again", variant: "secondary" }),
    ],
  );
/** A form block bound by recipe, in a card. */
const form = (recipe: string, children: Node[]) =>
  n("form", { form: "", recipe }, { gap: 16 }, children);
const card = (children: Node[], style: Style = {}) => {
  const box = n(
    "box",
    { variant: "card" },
    {
      gap: 20,
      padding: [32, 32, 32, 32],
      shadow: "md",
      width: "full",
      maxWidth: 640,
      ...style,
    },
    children,
  );
  box.mobile = { padding: [22, 18, 22, 18] };
  return box;
};

export const FORM_PRESETS: Preset[] = [
  {
    id: "form-contact",
    name: "Contact form",
    category: "forms",
    description: "Name, phone, email and a message, saved to your app",
    build: () =>
      section([
        n("columns", {}, { columns: 2, gap: 56, align: "start" }, [
          n("column", {}, { gap: 18 }, [
            text("Contact", "eyebrow"),
            heading("Send us a *message*"),
            text(
              "Questions, quotes or feedback — we reply within a working day.",
              "lead",
            ),
            n("list", {
              items: [
                "Replies within a day",
                "No spam, ever",
                "Or call us any time",
              ],
              marker: "check",
            }),
          ]),
          n("column", {}, { gap: 16 }, [
            card(
              [
                form("contact", [
                  field("name", { width: "half" }),
                  field("phone", { width: "half" }),
                  field("email"),
                  field("message", { placeholder: "How can we help?" }),
                  failed(),
                  send("Send message", { icon: "send" }),
                  done("Message sent", "Send another"),
                ]),
              ],
              { maxWidth: 0 },
            ),
          ]),
        ]),
      ]),
  },
  {
    id: "form-booking",
    name: "Booking form, two steps",
    category: "forms",
    description: "Contact details, then the service, date and time",
    build: () =>
      section(
        [
          intro(
            "Bookings",
            "Book an *appointment*",
            "Pick a time that suits you. We’ll confirm by phone.",
          ),
          card([
            form("booking", [
              n("formSteps"),
              n(
                "formStep",
                { kind: "details", label: "Your details" },
                { gap: 16 },
                [
                  field("name"),
                  field("phone", {
                    hint: "We’ll call or WhatsApp to confirm.",
                  }),
                  send("Continue"),
                ],
              ),
              n(
                "formStep",
                { kind: "details", label: "Your visit" },
                { gap: 16 },
                [
                  field("service", { display: "chips" }),
                  field("date", { width: "half" }),
                  field("time", { width: "half" }),
                  field("people", { width: "half" }),
                  field("notes"),
                  failed(),
                  n("row", {}, { gap: 12, justify: "between", wrap: false }, [
                    n("submit", {
                      label: "Back",
                      action: "back",
                      variant: "secondary",
                    }),
                    n("submit", {
                      label: "Request booking",
                      action: "submit",
                      icon: "check",
                    }),
                  ]),
                ],
              ),
              done("Booking requested", "Book another"),
            ]),
          ]),
        ],
        { align: "center" },
      ),
  },
  {
    id: "form-order",
    name: "Order form",
    category: "forms",
    description: "What they’d like, delivery or pickup, and where",
    build: () =>
      section([
        n(
          "columns",
          { reverse: true },
          { columns: 2, gap: 56, align: "center" },
          [
            n("column", {}, { gap: 18 }, [
              text("Order online", "eyebrow"),
              heading("Order in a *minute*"),
              text(
                "Tell us what you need. We’ll call to confirm the total and a delivery time.",
                "lead",
              ),
              n(
                "image",
                {
                  src: "/images/dairy.jpg",
                  alt: "Fresh groceries ready to pack",
                  ratio: "4/3",
                },
                { radius: "theme" },
              ),
            ]),
            n("column", {}, { gap: 16 }, [
              card(
                [
                  form("order", [
                    field("name", { width: "half" }),
                    field("phone", { width: "half" }),
                    field("product"),
                    field("delivery", { display: "radio" }),
                    field("address"),
                    field("date", { width: "half" }),
                    failed(),
                    send("Place order", { icon: "receipt" }),
                    done("Order placed", "Place another order"),
                  ]),
                ],
                { maxWidth: 0 },
              ),
            ]),
          ],
        ),
      ]),
  },
  {
    id: "form-registration",
    name: "Registration form",
    category: "forms",
    description: "Sign-ups for a class, event or programme",
    build: () =>
      section(
        [
          intro(
            "Join us",
            "Register *today*",
            "Seats are limited. Register and we’ll send the details.",
          ),
          card([
            form("registration", [
              field("name"),
              field("email", { width: "half" }),
              field("phone", { width: "half" }),
              field("batch", { display: "radio" }),
              field("updates", { display: "switch" }),
              failed(),
              send("Register"),
              done("You’re registered", "Register someone else"),
            ]),
          ]),
        ],
        { align: "center" },
      ),
  },
  {
    id: "form-feedback",
    name: "Feedback form",
    category: "forms",
    description: "A rating in one tap, comments and permission to reply",
    build: () =>
      section(
        [
          intro(
            "Feedback",
            "How did *we do*?",
            "Thirty seconds, and it really helps.",
          ),
          card([
            form("feedback", [
              field("rating", { display: "chips" }),
              field("comments", {
                placeholder: "What did you like? What could be better?",
              }),
              field("name"),
              field("contact", { display: "switch" }),
              failed(),
              send("Send feedback", { icon: "send" }),
              done("Thank you!", "Send more feedback"),
            ]),
          ]),
        ],
        { align: "center" },
      ),
  },
  {
    id: "form-track",
    name: "Track an order",
    category: "forms",
    description: "Visitors type their reference and phone to see progress",
    build: () =>
      section(
        [
          intro(
            "Track",
            "Where’s my *order*?",
            "Enter the reference from your confirmation and your phone number.",
          ),
          card([
            form("track", [
              field(REF_KEY, { width: "half" }),
              field("phone", { width: "half" }),
              failed(),
              send("Track", { icon: "search" }),
              n("formSuccess", {}, { gap: 16 }, [n("formRecord")]),
            ]),
          ]),
        ],
        { align: "center" },
      ),
  },
];

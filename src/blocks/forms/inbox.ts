/**
 * Contact and Email signup forms as form blocks posting to the Forma inbox
 * (`target: "inbox"`, drawn by classic.tsx). The inbox reads the boxes
 * named name, email and message (src/studio/requests.ts).
 */
import type { Node } from "../model";

/** Form blocks that keep a classic look (drawn by classic.tsx). */
export const isInboxForm = (n: Node) =>
  n.type === "form" && n.props.target === "inbox";
export const isClassicForm = (n: Node) =>
  n.type === "form" && n.props.look === "classic" && !isInboxForm(n);
export const inboxKind = (n: Node): "contact" | "newsletter" =>
  n.props.kind === "newsletter" ? "newsletter" : "contact";

/** One box of a Contact or Email signup form (an inbox form block's field). */
export interface InboxField {
  /** What the inbox reads: name, email or message. */
  name: "name" | "email" | "message";
  label: string;
  placeholder: string;
  /** The label is read out but not shown (the email signup). */
  hideLabel?: boolean;
  /** Editor: marks the box as its block. */
  attrs?: Record<string, string | undefined>;
}
/** The classic boxes of each kind of inbox form. */
export const INBOX_FIELDS: Record<"contact" | "newsletter", InboxField[]> = {
  contact: [
    { name: "name", label: "Your name", placeholder: "Alex Smith" },
    {
      name: "email",
      label: "Email address",
      placeholder: "Your email address",
    },
    {
      name: "message",
      label: "What’s on your mind?",
      placeholder: "Tell us a little about it…",
    },
  ],
  newsletter: [
    {
      name: "email",
      label: "Email address",
      placeholder: "Your email address",
      hideLabel: true,
    },
  ],
};

/**
 * A Contact (`contact`) or Email signup (`newsletter`) form block: its
 * boxes and button. `id` names the form; its blocks' ids derive from it.
 */
export function inboxFormNode(
  kind: "contact" | "newsletter",
  id: string,
  label: string,
  action = "",
): Node {
  let n = 0;
  const child = () => `${id}-c${(n++).toString(36)}`;
  return {
    id,
    type: "form",
    props: { form: "", target: "inbox", kind, action },
    children: [
      ...INBOX_FIELDS[kind].map((f): Node => ({
        id: child(),
        type: "field",
        props: {
          field: f.name,
          width: "full",
          label: f.label,
          placeholder: f.placeholder,
          ...(f.hideLabel ? { hideLabel: true } : {}),
        },
      })),
      {
        id: child(),
        type: "submit",
        props: {
          label,
          action: "submit",
          variant: "primary",
          size: "md",
          full: false,
          icon: "",
        },
      },
    ],
  };
}

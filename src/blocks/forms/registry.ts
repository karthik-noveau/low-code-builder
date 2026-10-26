/**
 * The form blocks' registry entries (spread into BLOCKS in ../registry.ts).
 * See model.ts for what each is; FormBlocks.tsx draws them.
 */
import type { BlockDef } from "../registry";
import type { FormNodeType } from "./model";

const choice = (...pairs: [string, string][]) =>
  pairs.map(([value, label]) => ({ value, label }));

export const FORM_BLOCKS: Record<FormNodeType, BlockDef> = {
  form: {
    label: "Form",
    icon: "checklist",
    category: "form",
    description: "A form or lookup from your business app, built from blocks",
    container: true,
    fields: [{ key: "form", label: "Form", kind: "form" }],
    props: () => ({ form: "" }),
    style: () => ({ gap: 16 }),
  },
  field: {
    label: "Field",
    icon: "edit",
    category: "form",
    description: "One question: text, phone, date, a choice…",
    fields: [
      { key: "field", label: "Asks for", kind: "formField" },
      {
        key: "label",
        label: "Label",
        kind: "text",
        placeholder: "The field’s name",
      },
      {
        key: "placeholder",
        label: "Example in the box",
        kind: "text",
        placeholder: "e.g. 98765 43210",
      },
      {
        key: "hint",
        label: "Help under the box",
        kind: "text",
        placeholder: "e.g. We only call about your booking.",
      },
      {
        key: "width",
        label: "Width",
        kind: "select",
        options: choice(
          ["full", "Full width"],
          ["half", "Half (two side by side)"],
          ["third", "A third (three side by side)"],
        ),
      },
    ],
    props: () => ({ field: "", width: "full" }),
  },
  submit: {
    label: "Form button",
    icon: "send",
    category: "form",
    description: "Sends the form, or goes back, confirms, starts again",
    inline: "label",
    fields: [
      { key: "label", label: "Label", kind: "text" },
      {
        key: "action",
        label: "What it does",
        kind: "select",
        options: choice(
          ["submit", "Send (or next page)"],
          ["back", "Back to the previous page"],
          ["confirm", "“Yes, that’s me” (Is this you?)"],
          ["change", "Start again with a different value"],
          ["again", "Fill in another (after sending)"],
        ),
      },
      {
        key: "variant",
        label: "Style",
        kind: "select",
        options: choice(
          ["primary", "Filled"],
          ["secondary", "Outlined"],
          ["ghost", "Soft"],
          ["link", "Text link"],
        ),
      },
      {
        key: "size",
        label: "Size",
        kind: "select",
        options: choice(["sm", "Small"], ["md", "Medium"], ["lg", "Large"]),
      },
      { key: "full", label: "Full width", kind: "toggle" },
      { key: "icon", label: "Icon after the label", kind: "icon" },
    ],
    props: () => ({
      label: "Send",
      action: "submit",
      variant: "primary",
      size: "md",
      full: false,
      icon: "",
    }),
  },
  formStep: {
    label: "Form step",
    icon: "pages",
    category: "form",
    description: "A step of a form shown one at a time",
    container: true,
    parents: ["form"],
    fields: [
      {
        key: "label",
        label: "Name in the step indicator",
        kind: "text",
        placeholder: "e.g. Your details",
      },
      {
        key: "kind",
        label: "This step",
        kind: "select",
        options: choice(
          ["details", "Questions"],
          ["identify", "Who are you? (visitors type their phone…)"],
          ["confirm", "Is this you? (after who are you)"],
        ),
      },
    ],
    props: () => ({ label: "Step", kind: "details" }),
    style: () => ({ gap: 16 }),
  },
  formSuccess: {
    label: "After sending",
    icon: "check",
    category: "form",
    description:
      "Shown once the form is sent; {ref} and {message} fill themselves in",
    container: true,
    parents: ["form"],
    fields: [],
    props: () => ({}),
    style: () => ({ gap: 12 }),
  },
  formError: {
    label: "When sending fails",
    icon: "help",
    category: "form",
    description: "Shown when the form can’t be sent; {message} says why",
    container: true,
    parents: ["form", "formStep"],
    fields: [],
    props: () => ({}),
    style: () => ({ gap: 6 }),
  },
  formSteps: {
    label: "Step indicator",
    icon: "checklist",
    category: "form",
    description: "Numbered dots for the form’s steps",
    fields: [],
    props: () => ({}),
  },
  formRecord: {
    label: "Found record",
    icon: "users",
    category: "form",
    description: "Who was found on “Is this you?”, or what a lookup found",
    fields: [],
    props: () => ({}),
  },
};

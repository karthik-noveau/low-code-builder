/**
 * What a classic-look app form block's blocks say, read by where they sit
 * (drawn by classic.tsx), and which block and prop each piece's words are
 * typed into on the canvas.
 */
import type { AppForm, FormCopyKey } from "../../apps/model";
import type { FormCustom } from "../../apps/AppSection";
import type { Node, PropValue } from "../model";
import { IDENTITY, stepKind } from "./model";

const str = (v: PropValue | undefined) => (typeof v === "string" ? v : "");
type Zone = "identify" | "confirm" | "fields" | "lookup" | "done";

/** What a classic form block's blocks say, read by where they sit. */
export interface Classic {
  title?: Node;
  intro?: Node;
  copy: Partial<Record<FormCopyKey, string>>;
  /** The block each copy word comes from. */
  said: Partial<Record<FormCopyKey, Node>>;
  button?: string;
  words: NonNullable<FormCustom["words"]>;
  /** Field id (or "identity", "value", "verify") → its block. */
  fields: Map<string, Node>;
  buttons: Map<string, Node>;
  extras: Record<"identify" | "fields" | "lookup", Node[]>;
}

export function readClassic(form: Node, app: AppForm, editing: string | null) {
  const out: Classic = {
    copy: {},
    said: {},
    words: {},
    fields: new Map(),
    buttons: new Map(),
    extras: { identify: [], fields: [], lookup: [] },
  };
  const visible = (n: Node) => !n.hidden || editing === n.id;
  const zoneOf = (step: Node): Zone => {
    const kind = stepKind(step);
    return kind === "identify"
      ? "identify"
      : kind === "confirm"
        ? "confirm"
        : "fields";
  };
  const heads: Partial<Record<Zone, FormCopyKey>> = {
    identify: "identifyTitle",
    lookup: "identifyTitle",
    confirm: "confirmTitle",
    fields: "fieldsTitle",
    done: "doneTitle",
  };
  const read = (nodes: Node[], zone: Zone) => {
    let pastButton = false;
    let headed = false;
    let introduced = false;
    for (const n of nodes.filter(visible)) {
      const extra = () => {
        if (zone !== "confirm" && zone !== "done") out.extras[zone].push(n);
      };
      switch (n.type) {
        case "field": {
          const id = str(n.props.field);
          const key =
            zone === "identify" || id === IDENTITY
              ? "identity"
              : zone === "lookup"
                ? id === app.key
                  ? "value"
                  : id === app.verify
                    ? "verify"
                    : ""
                : id;
          if (key && !out.fields.has(key)) out.fields.set(key, n);
          break;
        }
        case "submit": {
          const action = str(n.props.action) || "submit";
          const label = str(n.props.label);
          if (action === "submit") {
            pastButton = true;
            if (zone === "identify") {
              out.words.continue = label;
              out.buttons.set("continue", n);
            } else if (zone === "fields" || zone === "lookup") {
              out.button = label;
              out.buttons.set("button", n);
            }
          } else if (
            action === "confirm" ||
            action === "change" ||
            action === "again"
          )
            out.words[action] = label;
          break;
        }
        case "heading": {
          const key = heads[zone];
          if (key && !headed) {
            headed = true;
            out.copy[key] = str(n.props.text);
            out.said[key] = n;
          } else extra();
          break;
        }
        case "text": {
          const value = str(n.props.text);
          if (zone === "done" && value.includes("{message}")) break;
          if (zone === "fields" && value.includes("{name}")) {
            out.copy.fieldsIntro = value.replace(/\s*\{name\}\s*$/, "");
            break;
          }
          const say = (key: FormCopyKey) => {
            out.copy[key] = value;
            out.said[key] = n;
          };
          if (zone === "confirm" && !introduced) {
            introduced = true;
            say("confirmIntro");
          } else if (
            (zone === "identify" || zone === "lookup") &&
            !pastButton &&
            !introduced
          ) {
            introduced = true;
            say("identifyIntro");
          } else if ((zone === "identify" || zone === "lookup") && pastButton)
            say("identifyNote");
          else if (zone === "fields" && pastButton) say("fieldsNote");
          else extra();
          break;
        }
        case "formRecord":
        case "formError":
        case "formSteps":
          break;
        case "icon":
          if (zone !== "done") extra();
          break;
        default:
          extra();
      }
    }
  };
  const top: Node[] = [];
  for (const c of (form.children ?? []).filter(visible)) {
    if (c.props.part === "title" && c.type === "heading" && !out.title)
      out.title = c;
    else if (c.props.part === "intro" && c.type === "text" && !out.intro)
      out.intro = c;
    else if (c.type === "formStep") read(c.children ?? [], zoneOf(c));
    else if (c.type === "formSuccess") read(c.children ?? [], "done");
    else top.push(c);
  }
  read(top, app.kind === "lookup" ? "lookup" : "fields");
  return out;
}

/**
 * The block and prop a piece's words are typed into (FormCustom.text keys:
 * "title", "intro", a copy key, "continue" / "button", "label:" or "hint:"
 * and a field's key). Undefined when no block says it.
 */
export function classicPart(
  classic: Classic,
  key: string,
): { node: Node; prop: string } | undefined {
  if (key === "title" || key === "intro") {
    const node = classic[key];
    return node && { node, prop: "text" };
  }
  const at = key.indexOf(":");
  if (at > 0) {
    const prop = key.slice(0, at);
    const node = classic.fields.get(key.slice(at + 1));
    return node && (prop === "label" || prop === "hint")
      ? { node, prop }
      : undefined;
  }
  const button = classic.buttons.get(key);
  if (button) return { node: button, prop: "label" };
  const node = classic.said[key as FormCopyKey];
  return node && { node, prop: "text" };
}

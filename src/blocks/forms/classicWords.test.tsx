import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Project } from "../../studio/model";
import { createProject } from "../../studio/templates";
import { walk, type Node } from "../model";
import { Nodes, type RenderContext } from "../render";
import { classicPart, readClassic } from "./classicWords";

/** The classic-look form blocks of a template, with their app forms. */
function classicForms(p: Project) {
  return p.pages.flatMap((pg) =>
    pg.sections.flatMap((s) =>
      s.root
        ? [...walk([s.root])]
            .filter((n) => n.type === "form" && n.props.look === "classic")
            .map((n) => ({
              node: n,
              section: s.root!,
              form: p.app!.forms.find((f) => f.id === n.props.form)!,
            }))
        : [],
    ),
  );
}
const part = (
  node: Node,
  form: ReturnType<typeof classicForms>[number]["form"],
  key: string,
) => {
  const found = classicPart(readClassic(node, form, null), key);
  return found && { type: found.node.type, prop: found.prop, node: found.node };
};
const child = (n: Node, i: number) => n.children![i];

describe("typing a classic-look form's words on the canvas", () => {
  it("maps the title, intro, fields and button to their blocks", () => {
    const [{ node, form }] = classicForms(createProject("glow"));
    expect(part(node, form, "title")).toMatchObject({
      type: "heading",
      prop: "text",
      node: child(node, 0),
    });
    expect(part(node, form, "intro")).toMatchObject({
      type: "text",
      prop: "text",
      node: child(node, 1),
    });
    const fields = node.children!.filter((c) => c.type === "field");
    const first = String(fields[0].props.field);
    expect(part(node, form, `label:${first}`)).toMatchObject({
      prop: "label",
      node: fields[0],
    });
    expect(part(node, form, `hint:${first}`)).toMatchObject({
      prop: "hint",
      node: fields[0],
    });
    expect(part(node, form, "button")).toMatchObject({
      type: "submit",
      prop: "label",
      node: node.children!.find((c) => c.type === "submit"),
    });
    expect(part(node, form, `placeholder:${first}`)).toBeUndefined();
    expect(part(node, form, "label:nope")).toBeUndefined();
    expect(part(node, form, "continue")).toBeUndefined();
    expect(part(node, form, "identifyTitle")).toBeUndefined();
  });

  it("maps a step-by-step form's step words to the step's blocks", () => {
    const { node, form } = classicForms(createProject("dhanlaxmi")).find(
      (f) => f.form.steps,
    )!;
    const [identify, confirm, details] = node.children!.filter(
      (c) => c.type === "formStep",
    );
    const inStep = (step: Node, type: string, nth = 0) =>
      step.children!.filter((c) => c.type === type)[nth];
    expect(part(node, form, "identifyTitle")).toMatchObject({
      prop: "text",
      node: inStep(identify, "heading"),
    });
    expect(part(node, form, "identifyIntro")).toMatchObject({
      prop: "text",
      node: inStep(identify, "text"),
    });
    expect(part(node, form, "label:identity")).toMatchObject({
      prop: "label",
      node: inStep(identify, "field"),
    });
    expect(part(node, form, "continue")).toMatchObject({
      prop: "label",
      node: inStep(identify, "submit"),
    });
    expect(part(node, form, "confirmTitle")?.node).toBe(
      inStep(confirm, "heading"),
    );
    expect(part(node, form, "fieldsTitle")?.node).toBe(
      inStep(details, "heading"),
    );
    expect(part(node, form, "button")?.node).toBe(inStep(details, "submit"));
    // The note under the details step's button.
    expect(part(node, form, "fieldsNote")?.node).toBe(
      inStep(details, "text", 1),
    );
    // "Recording as {name}" isn't typed into (its {name} is the widget's).
    expect(part(node, form, "fieldsIntro")).toBeUndefined();
  });

  it("maps a lookup's heading, intro, box and note", () => {
    const { node, form } = classicForms(createProject("dhanlaxmi")).find(
      (f) => f.form.kind === "lookup",
    )!;
    const texts = node.children!.filter(
      (c) => c.type === "text" && !c.props.part,
    );
    expect(part(node, form, "identifyTitle")?.node).toBe(
      node.children!.find((c) => c.type === "heading" && !c.props.part),
    );
    expect(part(node, form, "identifyIntro")?.node).toBe(texts[0]);
    expect(part(node, form, "identifyNote")?.node).toBe(texts[1]);
    expect(part(node, form, "label:value")?.prop).toBe("label");
    expect(part(node, form, "button")?.prop).toBe("label");
  });

  it("draws the words to type into only in the editor", () => {
    const p = createProject("dhanlaxmi");
    const { section } = classicForms(p).find((f) => f.form.steps)!;
    const draw = (editing: boolean) => {
      const ctx: RenderContext = {
        project: p,
        exporting: !editing,
        href: (u) => u,
        edit: editing
          ? {
              selected: null,
              typing: null,
              onStartTyping: () => {},
              onFinishTyping: () => {},
              onCommit: () => {},
              onSelect: () => {},
            }
          : undefined,
      };
      return renderToStaticMarkup(<Nodes nodes={[section]} ctx={ctx} />);
    };
    const editor = draw(true);
    for (const label of [
      "Edit heading text",
      "Edit text text",
      "Edit field label",
      "Edit button text",
    ])
      expect(editor).toContain(`aria-label="${label}"`);
    expect(editor).toMatch(
      /<h3 class="app-step-title"[^>]*><span data-node-id="[^"]+" data-node-type="heading"[^>]*class=" inline-copy/,
    );
    const site = draw(false);
    expect(site).not.toContain("inline-copy");
    expect(site).not.toContain("data-node-id");
  });
});

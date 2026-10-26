import { describe, expect, it } from "vitest";
import {
  createAppField,
  createTable,
  describeLines,
  parseValues,
  type CatalogItem,
} from "./model";

const menu: CatalogItem[] = [
  { slug: "paneer-tikka", title: "Paneer tikka", price: 249.5 },
  { slug: "naan", title: "Butter naan", price: 45 },
];
const table = createTable("Orders", "Order");
const cart = createAppField("Your order", "items", {
  required: true,
  collection: "menu",
});
const dish = createAppField("Dish", "item", { collection: "menu" });
table.fields.push(cart, dish);
const catalog = (id: string) => (id === "menu" ? menu : undefined);

describe("ordering from a collection", () => {
  it("prices a cart on the server's prices, whatever the visitor sends", () => {
    const parsed = parseValues(
      table,
      [cart.id],
      { [cart.id]: { "paneer-tikka": 2, naan: 3 } },
      { catalog },
    );
    expect(parsed).toMatchObject({ ok: true, values: { [cart.id]: 634 } });
    if (parsed.ok)
      expect(describeLines(parsed.lines[cart.id])).toBe(
        "2 × Paneer tikka, 3 × Butter naan",
      );
  });
  it("reads a form post's slug:quantity list", () => {
    const parsed = parseValues(
      table,
      [cart.id],
      { [cart.id]: "naan:1,paneer-tikka:1" },
      { catalog },
    );
    expect(parsed).toMatchObject({ ok: true, values: { [cart.id]: 294.5 } });
  });
  it("refuses empty carts, unknown items and silly quantities", () => {
    for (const input of [{}, { ghost: 1 }, { naan: 0.5 }, { naan: 500 }])
      expect(
        parseValues(table, [cart.id], { [cart.id]: input }, { catalog }).ok,
      ).toBe(false);
    expect(parseValues(table, [cart.id], { [cart.id]: { naan: 1 } }).ok).toBe(
      false,
    );
  });
  it("keeps one chosen item's slug with its title", () => {
    const parsed = parseValues(
      table,
      [dish.id],
      { [dish.id]: "naan" },
      { catalog },
    );
    expect(parsed).toMatchObject({
      ok: true,
      values: { [dish.id]: "naan" },
      lines: { [dish.id]: [{ title: "Butter naan", quantity: 1 }] },
    });
  });
});

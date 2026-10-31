import { describe, expect, it } from "vitest";
import { refundAmount } from "./refunds";

const order = {
  lines: [
    { productId: "p", variantId: "a", quantity: 2, title: "Pot", variant: "S", sku: "", unitPrice: 2500, total: 5000 },
    { productId: "p", variantId: "b", quantity: 1, title: "Pot", variant: "L", sku: "", unitPrice: 4000, total: 4000 },
  ],
  subtotal: 9000,
  discount: 900,
  shipping: 500,
  tax: 860, // 10% of 8600
};
describe("refund amounts", () => {
  it("gives an item's price less its share of the discount, plus its tax", () => {
    // 2500 − 250 discount = 2250, + 10% tax = 2475.
    expect(refundAmount(order, [{ variantId: "a", quantity: 1 }], false)).toBe(2475);
  });
  it("adds up to the order's total for everything and shipping", () => {
    const all = [
      { variantId: "a", quantity: 2 },
      { variantId: "b", quantity: 1 },
    ];
    expect(refundAmount(order, all, true)).toBe(9000 - 900 + 500 + 860);
    expect(refundAmount(order, [], true)).toBe(550);
  });
});

// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createProject } from "./templates";
import { validateProject } from "./model";
import { createCollection } from "./collections";
import { renderItemPage } from "./export";
import { reviewProject } from "./review";
import {
  emptyPayments,
  formatAmount,
  parseAmount,
  paymentProblems,
  paymentReference,
  paymentStatusLabel,
  refundAmount,
  requestAmount,
  upiLink,
  usablePayments,
} from "./payments";

describe("getting paid without a provider", () => {
  it("reads prices as owners type them", () => {
    expect(parseAmount("1,299")).toBe(129900);
    expect(parseAmount("$24.50")).toBe(2450);
    expect(parseAmount("₹ 80")).toBe(8000);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("free")).toBeNull();
    expect(parseAmount("0")).toBeNull();
    expect(formatAmount(129900, "₹")).toBe("₹1,299");
    expect(formatAmount(2450, "$")).toBe("$24.50");
  });
  it("multiplies by quantity for orders and guests for RSVPs, not for bookings", () => {
    expect(requestAmount("order", 500, { quantity: "3" })).toBe(1500);
    expect(requestAmount("rsvp", 500, { guests: "2" })).toBe(1000);
    expect(requestAmount("book", 500, { guests: "4" })).toBe(500);
    expect(requestAmount("enquire", 500, {})).toBeNull();
    expect(requestAmount("order", null, { quantity: "3" })).toBeNull();
  });
  it("keeps half-typed details savable but only offers usable methods", () => {
    const project = createProject();
    project.payments = { ...emptyPayments(), upi: "karth", link: "rzp.io/x" };
    expect(validateProject(project)).toBe(true);
    expect(Object.keys(paymentProblems(project.payments))).toEqual([
      "upi",
      "link",
    ]);
    expect(usablePayments(project.payments)).toBeNull();
    project.payments.upi = "shop@okhdfc";
    expect(usablePayments(project.payments)?.upi).toBe("shop@okhdfc");
    project.payments.bank = "x".repeat(601);
    expect(validateProject(project)).toBe(false);
  });
  it("builds a UPI link with the amount only in rupees", () => {
    const p = { ...emptyPayments(), upi: "shop@okhdfc", payee: "Green Shop" };
    const rupees = upiLink(p, 129900, "₹", "AB12CD34");
    expect(rupees).toContain("pa=shop%40okhdfc");
    expect(rupees).toContain("pn=Green%20Shop");
    expect(rupees).toContain("am=1299.00");
    expect(rupees).toContain("cu=INR");
    expect(upiLink(p, 2450, "$", "AB12CD34")).not.toContain("am=");
    expect(
      paymentReference("1760000000000-ab12cd34-0000-4000-8000-000000000000"),
    ).toBe("AB12CD34");
  });
  it("tells visitors on the item page how they can pay", () => {
    const project = createProject();
    const c = createCollection("products");
    c.request = { kind: "order", label: "", collect: true };
    project.collections = [c];
    project.payments = { ...emptyPayments(), upi: "shop@okhdfc" };
    const html = renderItemPage(project, c, c.items[0], {
      inbox: "https://api.example/inbox/site",
    });
    expect(html).toContain("how to pay: UPI");
  });
  it("warns before publishing when a collection asks for payment with no way to pay", () => {
    const project = createProject();
    const c = createCollection("events");
    c.request = { kind: "rsvp", label: "", collect: true };
    project.collections = [c];
    expect(
      reviewProject(project).some((i) => i.id === "payments-missing"),
    ).toBe(true);
    project.payments = { ...emptyPayments(), upi: "hall@okaxis" };
    expect(
      reviewProject(project).some((i) => i.id === "payments-currency"),
    ).toBe(true);
    project.payments = { ...emptyPayments(), inPerson: "Pay at the door" };
    expect(
      reviewProject(project).some((i) => i.id.startsWith("payments")),
    ).toBe(false);
  });
});

describe("refunds", () => {
  const paid = {
    amount: 52000,
    currency: "₹",
    reference: "AB12CD34",
    status: "paid" as const,
  };
  it("refunds the whole payment unless a smaller amount is asked for", () => {
    expect(refundAmount(paid)).toEqual({ ok: true, amount: 52000 });
    expect(refundAmount(paid, 10000)).toEqual({ ok: true, amount: 10000 });
    expect(refundAmount(paid, 52000)).toEqual({ ok: true, amount: 52000 });
  });
  it("refuses amounts that can't be refunded", () => {
    expect(refundAmount(paid, 52001)).toEqual({
      ok: false,
      error: "You can refund at most ₹520.",
    });
    for (const amount of [0, -5, 1.5, "100"])
      expect(refundAmount(paid, amount).ok).toBe(false);
    expect(refundAmount({ ...paid, status: "unpaid" }).ok).toBe(false);
    expect(refundAmount({ ...paid, amount: null }).ok).toBe(false);
    const refunded = {
      ...paid,
      status: "refunded" as const,
      refund: {
        amount: 52000,
        key: "k",
        by: "u",
        requestedAt: "2026-10-30T10:00:00Z",
        refundedAt: "2026-10-30T10:00:01Z",
      },
    };
    expect(refundAmount(refunded)).toEqual({
      ok: false,
      error: "This payment was already refunded.",
    });
  });
  it("names full and partial refunds", () => {
    const refund = { key: "k", by: "u", requestedAt: "", refundedAt: "x" };
    expect(paymentStatusLabel(paid)).toBe("Paid");
    expect(paymentStatusLabel({ ...paid, status: "unpaid" })).toBe("Unpaid");
    expect(
      paymentStatusLabel({
        ...paid,
        status: "refunded",
        refund: { ...refund, amount: 52000 },
      }),
    ).toBe("Refunded");
    expect(
      paymentStatusLabel({
        ...paid,
        status: "refunded",
        refund: { ...refund, amount: 100 },
      }),
    ).toBe("Partly refunded");
  });
});

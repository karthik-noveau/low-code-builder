import { useStudio } from "./store";
import { Field } from "./ui";
import {
  emptyPayments,
  PAYMENT_LIMITS,
  paymentProblems,
  type PaymentSettings,
} from "./payments";

/** Site-wide payment options for visitor actions (Settings → Get paid). */
export function PaymentsPanel({ inData = false }: { inData?: boolean }) {
  const project = useStudio((s) => s.project);
  const commit = useStudio((s) => s.commit);
  const payments = project.payments ?? emptyPayments();
  const problems = paymentProblems(payments);
  const asking = (project.collections ?? []).filter((c) => c.request?.collect);
  const set = (key: keyof PaymentSettings) => (value: string) =>
    commit(
      (p) => ({
        ...p,
        payments: {
          ...(p.payments ?? emptyPayments()),
          [key]: value.slice(0, PAYMENT_LIMITS[key]),
        },
      }),
      `payments:${key}`,
    );
  return (
    <div className="payments-panel">
      {!inData && (
        <p className="muted-note">
          After an order, booking or RSVP, visitors see the total, a reference
          and these options. Money goes straight to you: no fees, nothing to
          connect. Mark requests paid in your Inbox.
        </p>
      )}
      <Field
        label="UPI ID"
        value={payments.upi}
        placeholder="yourname@okbank"
        maxLength={PAYMENT_LIMITS.upi}
        hint={problems.upi}
        onChange={set("upi")}
      />
      {payments.upi && (
        <Field
          label="Name shown in UPI apps"
          value={payments.payee}
          placeholder={project.name}
          maxLength={PAYMENT_LIMITS.payee}
          onChange={set("payee")}
        />
      )}
      <Field
        label="Payment link"
        value={payments.link}
        placeholder="https://buy.stripe.com/… or https://rzp.io/…"
        maxLength={PAYMENT_LIMITS.link}
        hint={
          problems.link ??
          "A link from Stripe, Razorpay, PayPal or any provider you use."
        }
        onChange={set("link")}
      />
      <Field
        label="Bank transfer details"
        multiline
        value={payments.bank}
        placeholder={"Account name\nAccount number\nIFSC / sort code"}
        maxLength={PAYMENT_LIMITS.bank}
        onChange={set("bank")}
      />
      <Field
        label="Pay in person"
        value={payments.inPerson}
        placeholder="Pay at the counter or on delivery"
        maxLength={PAYMENT_LIMITS.inPerson}
        onChange={set("inPerson")}
      />
      <Field
        label="Note for visitors"
        value={payments.note}
        placeholder="We confirm your booking once payment arrives."
        maxLength={PAYMENT_LIMITS.note}
        onChange={set("note")}
      />
      {!inData && (
        <p className="muted-note">
          {asking.length
            ? `Asking for payment: ${asking.map((c) => c.name).join(", ")}.`
            : "Turn on “Ask visitors to pay” in Data → a collection → Settings."}
        </p>
      )}
    </div>
  );
}

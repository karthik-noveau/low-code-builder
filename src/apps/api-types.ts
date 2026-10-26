/**
 * The business app API, shared by the backend (backend/apps.ts), the owner's
 * app page and the published-site widget.
 *
 * Owner routes (signed in; need edit access, since records hold visitors'
 * contact details). Browsers' CORS rules allow only GET, POST and PUT, so
 * deletes are POST …/delete.
 *   GET  /sites/:id/app                                  → AppInfo
 *   GET  /sites/:id/app/records?table=:tableId           → RecordList
 *   POST /sites/:id/app/records                          { table, values } → { record } 201
 *   PUT  /sites/:id/app/records/:recordId                { values, revision } → { record }
 *   POST /sites/:id/app/records/:recordId/delete         → { deleted: true }; 409 when linked records exist
 *   POST /sites/:id/app/records/:recordId/actions/:actionId { values, note, revision } → { record }
 *                                                        409 when the record changed or the action
 *                                                        isn't offered from its status; 422 limits
 *   GET  /sites/:id/app/summary                          → Summary
 *   GET  /sites/:id/app/devices                          → { devices: PushDevice[] }
 *   POST /sites/:id/app/devices                          { subscription: PushSubscriptionJSON, label } → { device } 201
 *   POST /sites/:id/app/devices/:deviceId/delete         → { deleted: true }
 *   POST /sites/:id/app/devices/test                     → { sent: number }
 *
 * Public routes (no sign-in, CORS open, the live release's definition only):
 *   GET  /push/key                                       → { publicKey } (VAPID, base64url)
 *   GET  /apps/:siteId/forms/:formId/find?value=…        → FindResult; 404 { message } unknown value;
 *                                                        429 too many lookups (per IP per minute)
 *   GET  /apps/:siteId/forms/:formId/find?value=…&verify=… (lookup with `verify`: both must match)
 *   POST /apps/:siteId/forms/:formId                     SubmitInput → SubmitResult 201;
 *                                                        422 { message, field }; 404 form not live;
 *                                                        409 { message, field } a capacity is full
 *   GET  /apps/:siteId/forms/:formId/availability        → Availability (places left, for the form's table)
 *   GET  /apps/:siteId/records/:recordId/pay?key=…       → SubmitResult["payment"] refreshed (checkout paid?)
 *
 * Owner routes added for payments:
 *   POST /sites/:id/app/records/:recordId/paid           { revision } → { record } (marks the payment paid)
 *
 * Errors are { message, field? } as everywhere else.
 */
import type { App, AppFieldType, AppRecord, StatusTone } from "./model";

export interface AppInfo {
  /** The app in the latest saved draft; null when the site has none yet. */
  app: App | null;
  /** Forms on the live site accept visitors only once the site is published. */
  published: boolean;
}
/** Record id → title for every table, so link fields show names, not ids. */
export type LinkTitles = Record<string, Record<string, string>>;
export interface RecordList {
  records: AppRecord[];
  links: LinkTitles;
}
export interface Summary {
  cards: { id: string; name: string; value: number; money: boolean }[];
  lists: { id: string; name: string; table: string; records: AppRecord[] }[];
  links: LinkTitles;
}
export interface PushDevice {
  id: string;
  label: string;
  createdAt: string;
}
/** A value ready to show: already formatted (money, dates) and masked. */
export interface ShownValue {
  name: string;
  value: string;
}
/** A field's value on a history entry, with what it is so pages can lay it out. */
export interface EntryValue extends ShownValue {
  type: AppFieldType;
  /** Filled by the owner (e.g. a reward), shown as "+₹920" once approved. */
  owner?: boolean;
}
/**
 * A rolled-up total: `value` is formatted; `amount` is the raw figure so
 * pages can count ("18 approved submissions") and pick an icon.
 */
export interface TotalValue extends ShownValue {
  id: string;
  amount: number;
  money: boolean;
  /** The tone shared by every status the total counts (e.g. "good"), when one. */
  tone?: StatusTone;
  /** Money in a compact form for small tiles, e.g. ₹2.4L. */
  short?: string;
  /**
   * The figure in words: a count of one status reads "18 approved
   * submissions" (status and table), anything else "₹12,450 earned"
   * (the total's name, lower case).
   */
  phrase: string;
}
export type FindResult =
  /** submit form with identify: "Is this you?" */
  | {
      kind: "match";
      fields: ShownValue[];
      /** The record's title (e.g. the customer's name) and its initials. */
      title?: string;
      initials?: string;
      /** The form's `confirmTotals`, in order. */
      totals?: TotalValue[];
    }
  /** lookup form: the record, its totals and history. */
  | {
      kind: "record";
      fields: ShownValue[];
      /** The form's totals, without the highlighted one. */
      totals: TotalValue[];
      /** Lookups by a unique value: who was found, for the header. */
      title?: string;
      initials?: string;
      /** The value they typed, masked like the rest (e.g. •••••3210). */
      key?: string;
      /** When the record was added (forms with `since`). */
      since?: string;
      /**
       * The form's `highlight` total, with `across`: the count of the same
       * statuses, preferring one that isn't a tile ("18 approved submissions").
       */
      highlight?: TotalValue & { across?: TotalValue };
      /** Set when the lookup found one record by its reference (REF_KEY). */
      ref?: string;
      status?: { name: string; tone: StatusTone } | null;
      note?: string;
      /** What was ordered or chosen, e.g. "2 × Paneer tikka". */
      lines?: { title: string; quantity: number; price: string }[];
      /** The record's own steps, oldest first (reference lookups). */
      steps?: { name: string; at: string; note?: string }[];
      history: {
        ref: string;
        status: { name: string; tone: StatusTone } | null;
        note: string;
        createdAt: string;
        /** When it last moved to another status (e.g. approved); absent until then. */
        at?: string;
        fields: EntryValue[];
      }[];
    };
/**
 * Places left per capacity. `left` is keyed by the group fields' values
 * joined with "|" (e.g. "2026-11-02|19:00", or an event's item slug). Only
 * groups with bookings are listed; any other group has `max` left (for a
 * `maxField` capacity, every item is listed with its own number).
 */
export interface Availability {
  capacities: {
    id: string;
    group: string[];
    max: number;
    left: Record<string, number>;
  }[];
}
export interface SubmitInput {
  /** The identify field's value (e.g. phone) when the form identifies visitors. */
  identity?: string;
  /** "items" fields send { slug: quantity }; everything else a string. */
  values: Record<string, string | Record<string, number>>;
  /** A random id per attempt; a repeated key returns the first result, so a double tap adds one record. */
  key: string;
  /** Honeypot; people never see it. */
  website?: string;
}
export interface SubmitResult {
  ref: string;
  /** The new record's status, for the success screen's badge. */
  status?: { name: string; tone: StatusTone } | null;
  /** The form's success text with {ref} filled in. */
  message: string;
  /** Present when the form asks for payment and there's a way to pay. */
  payment?: {
    amount: string;
    status: "unpaid" | "paid";
    reference: string;
    /** A UPI deep link (upi://pay…) when the site has a UPI id. */
    upi?: string;
    /** Bank / cash instructions from the site's payment settings. */
    instructions?: string;
    /** An online checkout (Stripe or Razorpay) when connected. */
    checkout?: string;
    /** The record id and key to refresh this payment's status. */
    recordId: string;
  };
}

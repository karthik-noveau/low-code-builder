/**
 * Formatting and small rules for the owner app, ported from the Dhanlaxmi
 * Rewards owner app so figures, dates and wording read exactly the same.
 */
import { formatMoney } from "../apps/model";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const parse = (value: string | number | Date): Date | null => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** "22 Aug 2026" */
export const formatDate = (value: string | number | Date) => {
  const date = parse(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

/** "22 Aug 2026, 6:48 pm" */
export const formatDateTime = (value: string | number | Date) => {
  const date = parse(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

/** "12 minutes ago", "yesterday", "3 days ago", then the date. */
export const formatRelativeTime = (
  value: string | number | Date,
  now: Date = new Date(),
) => {
  const date = parse(value);
  if (!date) return "";
  const elapsed = now.getTime() - date.getTime();
  if (elapsed < 0) return formatDate(date);
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }
  if (elapsed < 2 * DAY) return "yesterday";
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)} days ago`;
  return formatDate(date);
};

/** ₹8.6L / ₹1.2Cr for a stat card where the full figure would overflow. */
export function formatMoneyCompact(value: number, currency: string) {
  const amount = Number.isFinite(value) ? value : 0;
  if (currency === "INR") {
    if (Math.abs(amount) >= 10_000_000)
      return `₹${(amount / 10_000_000).toFixed(1)}Cr`;
    if (Math.abs(amount) >= 100_000)
      return `₹${(amount / 100_000).toFixed(1)}L`;
  }
  return formatMoney(amount, currency);
}

/** Strips grouping and the rupee sign; at most two decimals, else null. */
export const parseAmount = (input: string): number | null => {
  const cleaned = input.replace(/[,\s₹]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

export const pluralise = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

/** First letters of the first two words: "Ravi Kumar" → "RK". */
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase() || "?";

/** "98400 12210" for a ten-digit Indian mobile; anything else as stored. */
export function formatPhone(phone: string) {
  let digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length !== 10) return String(phone ?? "");
  return `${digits.slice(0, 5)} ${digits.slice(5)}`;
}

export type Greeting = "Good morning" | "Good afternoon" | "Good evening";
export const greetingFor = (date: Date = new Date()): Greeting => {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

/**
 * What the dashboard greets: Forma accounts have an email, not a name, so
 * "selvam.balaji@shop.in" greets "Selvam".
 */
export function firstNameOf(email: string) {
  const local = (email.split("@")[0] ?? "").split(/[._+-]/)[0] ?? "";
  if (!local) return "there";
  return local.charAt(0).toUpperCase() + local.slice(1);
}
/** "Selvam Balaji" from "selvam.balaji@shop.in", for the sidebar. */
export function displayNameOf(email: string) {
  const local = email.split("@")[0] ?? "";
  const words = local.split(/[._+-]+/).filter(Boolean);
  if (!words.length) return "Shop owner";
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** Reward as a share of the purchase value it rewarded; "—" with nothing approved. */
export const rewardRate = (reward: number, purchaseValue: number) =>
  purchaseValue <= 0 ? "—" : `${((reward / purchaseValue) * 100).toFixed(1)}%`;

/* ---------- reward presets ---------- */

/**
 * A preset is a share of the purchase or a flat sum. One mode covers all four
 * buttons. Presets FILL the reward field; they never approve anything.
 */
export type PresetMode = "percent" | "amount";
export interface RewardPresets {
  mode: PresetMode;
  values: string[];
}
export const DEFAULT_PERCENT_PRESETS = ["2", "3", "5", "7"];
export const DEFAULT_AMOUNT_PRESETS = ["100", "250", "500", "1000"];
export const defaultValuesFor = (mode: PresetMode) =>
  mode === "percent"
    ? [...DEFAULT_PERCENT_PRESETS]
    : [...DEFAULT_AMOUNT_PRESETS];

const MAX_AMOUNT = 10_000_000;
export function isValidPreset(value: string, mode: PresetMode) {
  const text = value.trim();
  if (mode === "percent") {
    if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return false;
    const n = Number(text);
    return n > 0 && n <= 100;
  }
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(text)) return false;
  const n = Number(text);
  return n >= 0.01 && n <= MAX_AMOUNT;
}
/** What the button reads: "5%" or "₹500". */
export const presetLabel = (
  value: string,
  mode: PresetMode,
  currency = "INR",
) => (mode === "percent" ? `${value}%` : formatMoney(Number(value), currency));
/** What the button puts in the reward field for this purchase. */
export const presetAmountFor = (
  value: string,
  mode: PresetMode,
  purchaseAmount: number,
) =>
  mode === "percent"
    ? Math.round(((purchaseAmount * Number(value)) / 100) * 100) / 100
    : Number(value);

export const presetsKey = (siteId: string) => `forma-owner-presets:${siteId}`;
/** Per site, on this device; anything unreadable falls back to the defaults. */
export function readRewardPresets(siteId: string): RewardPresets {
  try {
    const raw = localStorage.getItem(presetsKey(siteId));
    if (!raw) return { mode: "percent", values: defaultValuesFor("percent") };
    const parsed = JSON.parse(raw) as { mode?: unknown; values?: unknown };
    const mode: PresetMode = parsed.mode === "amount" ? "amount" : "percent";
    const values = Array.isArray(parsed.values) ? parsed.values : [];
    return {
      mode,
      values: defaultValuesFor(mode).map((fallback, i) => {
        const v = values[i];
        return typeof v === "string" && isValidPreset(v, mode)
          ? v.trim()
          : fallback;
      }),
    };
  } catch {
    return { mode: "percent", values: defaultValuesFor("percent") };
  }
}
/** False when the browser blocks storage, so the page can say so. */
export function writeRewardPresets(siteId: string, presets: RewardPresets) {
  try {
    localStorage.setItem(presetsKey(siteId), JSON.stringify(presets));
    return true;
  } catch {
    return false;
  }
}

/* ---------- small storage helpers ---------- */

export function readStored(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writeStored(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // The preference isn't remembered; everything still works.
  }
}

/* ---------- accent colours ---------- */

const hex = (value: string) =>
  /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : "#e07400";
/** Relative luminance, to choose white or dark text on the accent. */
export function luminance(colour: string) {
  const c = hex(colour);
  const channel = (i: number) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
/** The reference orange; its stat cards keep the reference's exact colours. */
export const REFERENCE_ACCENT = "#e07400";
/**
 * CSS variables for an accent: the brand, its hover, the text on it, and the
 * burnt "accent" stat card. Pale tints are derived in owner.css.
 */
export function accentVariables(accent: string): Record<string, string> {
  const brand = hex(accent);
  const reference = brand === REFERENCE_ACCENT;
  const onBrand = luminance(brand) > 0.42 ? "#101623" : "#ffffff";
  return {
    "--colour-brand": brand,
    "--colour-brand-hover": reference
      ? "#dd7607"
      : `color-mix(in srgb, ${brand} 90%, #000)`,
    "--colour-on-brand": onBrand,
    "--owner-accent-card": reference
      ? "#b85c24"
      : `color-mix(in srgb, ${brand} 78%, #1b1209)`,
    "--owner-accent-card-dark": reference
      ? "#633a24"
      : `color-mix(in srgb, ${brand} 40%, #11161d)`,
    "--owner-heading-active": reference
      ? "#994d09"
      : `color-mix(in srgb, ${brand} 68%, #000)`,
    "--owner-heading-active-dark": reference
      ? "#ffbd75"
      : `color-mix(in srgb, ${brand} 55%, #fff)`,
  };
}

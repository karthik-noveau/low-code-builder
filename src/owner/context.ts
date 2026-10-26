import { createContext, useContext } from "react";
import type { Account } from "../cloud/client";
import type { AppAction, AppRecord, AppTable } from "../apps/model";
import type { LinkTitle } from "../apps/app-helpers";
import type { OwnerModel } from "./roles";
import type { Route } from "./route";
import type { OwnerActions, OwnerData } from "./useOwnerData";

export type ThemePref = "light" | "dark" | "system";
export interface OwnerContextValue {
  siteId: string;
  shopName: string;
  logo?: string;
  model: OwnerModel;
  data: OwnerData;
  actions: OwnerActions;
  account: Account;
  /** Records of a table (empty while loading). */
  records: (tableId: string) => AppRecord[];
  linkTitle: LinkTitle;
  money: (value: number) => string;
  go: (route: Route) => void;
  href: (route: Route) => string;
  /** Opens the add form for a table (the topbar's "New customer"). */
  openNew: (table: AppTable) => void;
  /** Opens an action's dialog (Approve / Reject) for a record. */
  review: (record: AppRecord, action: AppAction) => void;
  edit: (record: AppRecord) => void;
  signOut: () => void;
  theme: {
    pref: ThemePref;
    resolved: "light" | "dark";
    setPref: (pref: ThemePref) => void;
  };
  /** Push devices for this site (null until loaded). */
  deviceCount: number | null;
  setDeviceCount: (n: number) => void;
}
export const OwnerContext = createContext<OwnerContextValue | null>(null);
export function useOwner() {
  const value = useContext(OwnerContext);
  if (!value) throw new Error("useOwner outside the owner app");
  return value;
}

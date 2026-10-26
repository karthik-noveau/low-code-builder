import { createContext, useContext } from "react";

export type ToastTone = "success" | "warning" | "error" | "info";
export interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  text?: string;
}
export type Toaster = (tone: ToastTone, title: string, text?: string) => void;

export const ToastContext = createContext<Toaster>(() => {});
/** Shows a toast in the corner, like the reference ("Approved · ₹900 reward"). */
export const useToast = () => useContext(ToastContext);

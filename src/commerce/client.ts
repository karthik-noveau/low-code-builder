import { initializeCloud, request, ApiError } from "../cloud/client";
import type { CommerceOverview } from "./types";

export const commerceRequest = <T>(
  siteId: string,
  path = "",
  input?: unknown,
  method?: string,
) =>
  request<T>(
    `/sites/${siteId}/commerce${path ? `/${path}` : ""}`,
    input === undefined
      ? undefined
      : { method: method || "POST", body: JSON.stringify(input) },
  );
export const loadCommerce = (siteId: string) =>
  commerceRequest<CommerceOverview>(siteId);
export async function storeRequest<T>(
  siteId: string,
  path = "",
  input?: unknown,
): Promise<T> {
  const { config } = await initializeCloud();
  if (!config.apiUrl) throw new Error("The store service is unavailable.");
  const response = await fetch(
    `${config.apiUrl}/store/${siteId}${path ? `/${path}` : ""}`,
    {
      method: input === undefined ? "GET" : "POST",
      headers:
        input === undefined
          ? undefined
          : { "content-type": "application/json" },
      body: input === undefined ? undefined : JSON.stringify(input),
      signal: AbortSignal.timeout(30000),
    },
  );
  const value = await response.json();
  if (!response.ok)
    throw new ApiError(
      response.status,
      value.error || "The store could not complete this request.",
    );
  return value as T;
}
export function download(
  name: string,
  value: unknown,
  type = "application/json",
) {
  const url = URL.createObjectURL(
    new Blob(
      [typeof value === "string" ? value : JSON.stringify(value, null, 2)],
      { type },
    ),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

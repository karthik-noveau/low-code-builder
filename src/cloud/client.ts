import type { UserManager } from "oidc-client-ts";
import {
  validateProject,
  type Project,
  type TemplateId,
} from "../studio/model";

export interface CloudConfig {
  enabled: boolean;
  mode?: "local" | "aws";
  apiUrl?: string;
  issuer?: string;
  clientId?: string;
  authDomain?: string;
}
export interface Account {
  id: string;
  email: string;
}
export interface Site {
  id: string;
  name: string;
  template?: TemplateId;
  version: number;
  checksum?: string;
  status: string;
  updatedAt: string;
  publishedRelease?: string;
  publishedAt?: string;
  primaryDomain?: string;
  defaultUrl?: string;
  url?: string;
  error?: string;
}
export interface Release {
  id: string;
  version: number;
  createdAt: string;
}
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
let config: CloudConfig = { enabled: false };
let configured = false;
let manager: UserManager | undefined;
const sessionKey = "forma-local-session";
let localToken = "";
let initialization:
  | Promise<{ config: CloudConfig; account?: Account }>
  | undefined;
export function initializeCloud() {
  return (initialization ??= initialize());
}
async function initialize(): Promise<{
  config: CloudConfig;
  account?: Account;
}> {
  const response = await fetch("/cloud-config.json", { cache: "no-store" });
  if (!response.ok)
    throw new Error("The workspace configuration could not be loaded.");
  config = (await response.json()) as CloudConfig;
  configured = true;
  if (!config.enabled) return { config };
  if (!config.apiUrl || !config.mode)
    throw new Error("The workspace configuration is incomplete.");
  const endpoint = new URL(config.apiUrl);
  if (config.mode === "local") {
    if (
      !["localhost", "127.0.0.1"].includes(location.hostname) ||
      !["localhost", "127.0.0.1"].includes(endpoint.hostname)
    )
      throw new Error("Local accounts require a local editor.");
    localToken = sessionStorage.getItem(sessionKey) || "";
    if (!localToken) return { config };
    try {
      return {
        config,
        account: (await request<{ user: Account }>("/auth/me")).user,
      };
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      sessionStorage.removeItem(sessionKey);
      localToken = "";
      return { config };
    }
  }
  if (
    endpoint.protocol !== "https:" ||
    !config.issuer ||
    !config.clientId ||
    !config.authDomain?.startsWith("https://")
  )
    throw new Error("Invalid cloud configuration.");
  const { UserManager: OidcManager, WebStorageStateStore } = await import(
    "oidc-client-ts"
  );
  manager = new OidcManager({
    authority: config.issuer,
    client_id: config.clientId,
    redirect_uri: `${location.origin}/`,
    response_type: "code",
    scope: "openid email",
    automaticSilentRenew: false,
    userStore: new WebStorageStateStore({ store: sessionStorage }),
    stateStore: new WebStorageStateStore({ store: sessionStorage }),
    metadata: {
      issuer: config.issuer,
      authorization_endpoint: `${config.authDomain}/oauth2/authorize`,
      token_endpoint: `${config.authDomain}/oauth2/token`,
      jwks_uri: `${config.issuer}/.well-known/jwks.json`,
    },
  });
  if (
    new URLSearchParams(location.search).has("code") ||
    new URLSearchParams(location.search).has("error")
  ) {
    await manager.signinRedirectCallback();
    history.replaceState({}, "", "/");
  }
  const user = await manager.getUser();
  return {
    config,
    account:
      user && !user.expired
        ? { id: user.profile.sub, email: user.profile.email || "Your account" }
        : undefined,
  };
}
export async function signIn(
  mode: "login" | "register",
  email: string,
  password: string,
): Promise<Account | undefined> {
  if (config.mode === "aws") {
    await manager?.signinRedirect();
    return;
  }
  const result = await request<{ token: string; user: Account }>(
    `/auth/${mode}`,
    { method: "POST", body: JSON.stringify({ email, password }) },
  );
  localToken = result.token;
  sessionStorage.setItem(sessionKey, result.token);
  return result.user;
}
export async function signOut() {
  if (config.mode === "local") {
    await request("/auth/logout", { method: "POST" });
    localToken = "";
    sessionStorage.removeItem(sessionKey);
  } else {
    await manager?.removeUser();
    location.assign(
      `${config.authDomain}/logout?client_id=${encodeURIComponent(config.clientId!)}&logout_uri=${encodeURIComponent(`${location.origin}/`)}`,
    );
  }
}
async function accessToken() {
  if (config.mode === "local") return localToken;
  let user = await manager?.getUser();
  if (user?.expired) user = await manager?.signinSilent();
  return user?.access_token || "";
}
async function fetchApi(path: string, options: RequestInit = {}) {
  // A page can ask while the workspace is still loading (e.g. a deep link
  // that opens the inbox straight away); wait for it instead of failing.
  if (!configured && initialization) await initialization.catch(() => {});
  if (!config.enabled || !config.apiUrl)
    throw new Error("Workspace is not connected.");
  const token = await accessToken();
  const headers = new Headers(options.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (options.body && !headers.has("content-type"))
    headers.set("content-type", "application/json");
  const response = await fetch(`${config.apiUrl}${path}`, {
    ...options,
    headers,
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new ApiError(
      response.status,
      error.error || `Request failed (${response.status}).`,
    );
  }
  return response;
}
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  return (await fetchApi(path, options)).json() as Promise<T>;
}
export const listSites = () => request<{ sites: Site[] }>("/sites");
/** When this account last opened its notifications (shared by every browser). */
export const notificationsSeen = () =>
  request<{ seenAt: string }>("/account/notifications");
export const markNotificationsSeen = (seenAt: string) =>
  request<{ seenAt: string }>("/account/notifications", {
    method: "POST",
    body: JSON.stringify({ seenAt }),
  });
export const createSite = (name: string) =>
  request<{ site: Site }>("/sites", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
export const siteStatus = (id: string) =>
  request<{ site: Site }>(`/sites/${id}`);
export const releases = (id: string) =>
  request<{ releases: Release[] }>(`/sites/${id}/releases`);
export async function saveDraft(site: Site, project: Project) {
  const text = JSON.stringify(project);
  if (new TextEncoder().encode(text).length > 20 * 1024 * 1024)
    throw new Error(
      "This draft exceeds 20 MB. Remove unused images before saving.",
    );
  const stream = new Blob([text])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const body = await new Response(stream).arrayBuffer();
  if (body.byteLength > 3 * 1024 * 1024)
    throw new Error(
      "This draft exceeds 3 MB compressed. Remove unused images or use image URLs.",
    );
  return request<{ site: Site }>(`/sites/${site.id}/draft`, {
    method: "PUT",
    headers: {
      "content-type": "application/gzip",
      "if-match": String(site.version),
    },
    body,
  });
}
export async function loadDraft(id: string) {
  const response = await fetchApi(`/sites/${id}/draft`);
  const project: unknown = await response.json();
  if (!validateProject(project))
    throw new Error("The saved draft could not be read.");
  return { project, version: Number(response.headers.get("x-draft-version")) };
}
export const publish = (
  site: Site,
  action: "publish" | "rollback" | "unpublish",
  releaseId?: string,
) =>
  request<{ site: Site }>(`/sites/${site.id}/${action}`, {
    method: "POST",
    body: JSON.stringify({ version: site.version, releaseId }),
  });

export interface DomainDnsRecord {
  type: "TXT" | "CNAME" | "ALIAS";
  name: string;
  value: string;
  purpose: "ownership" | "certificate" | "routing";
}
export interface DomainConnection {
  id: string;
  hostname: string;
  status:
    | "ownership"
    | "certificate"
    | "deploying"
    | "dns"
    | "connected"
    | "disconnected"
    | "failed"
    | "removing"
    | "removed";
  records: DomainDnsRecord[];
  message?: string;
  checkedAt?: string;
  verifiedAt?: string;
  target?: string;
  local: boolean;
  url?: string;
}
export const listDomains = (siteId: string) =>
  request<{ domains: DomainConnection[] }>(`/sites/${siteId}/domains`);
export const addDomain = (siteId: string, hostname: string) =>
  request<{ domain: DomainConnection }>(`/sites/${siteId}/domains`, {
    method: "POST",
    body: JSON.stringify({ hostname }),
  });
export const domainAction = (
  siteId: string,
  domainId: string,
  action: "check" | "retry" | "disconnect" | "primary" | "remove",
) =>
  request<{ domain: DomainConnection }>(
    `/sites/${siteId}/domains/${domainId}/${action}`,
    { method: "POST", body: "{}" },
  );
export const saveLocalDns = (
  siteId: string,
  domainId: string,
  records: DomainDnsRecord[],
) =>
  request<{ domain: DomainConnection }>(
    `/sites/${siteId}/domains/${domainId}/local-dns`,
    { method: "POST", body: JSON.stringify({ records }) },
  );

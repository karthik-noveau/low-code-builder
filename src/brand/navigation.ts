import { collections, guides, pageMeta } from "./content";

export function safeDestination(value: string | null) {
  return value &&
    /^\/(?:workspace|new|editor|domains|commerce|store|account|customer)(?:\?|$)/.test(
      value,
    ) &&
    !/[\\\r\n]/.test(value)
    ? value
    : "/workspace";
}

export const publicPaths = [
  "/",
  "/features",
  "/templates",
  "/pricing",
  "/about",
  "/help",
  "/privacy",
  ...guides.map((guide) => `/help/${guide.id}`),
];
export const privatePaths = [
  "/login",
  "/signup",
  "/workspace",
  "/workspace/templates",
  "/domains",
  "/new",
  "/editor",
  "/commerce",
  "/store",
  "/customer",
  "/account",
];
export const previewPaths = collections.map((item) => `/templates/${item.id}`);

export function metadataFor(path: string) {
  if (path === "/commerce")
    return {
      title: "Store management — Forma",
      description: "Manage your products, orders, customers and storefront.",
    };
  if (path === "/store")
    return {
      title: "Storefront — Forma",
      description: "Explore this Forma store.",
    };
  if (path === "/customer")
    return {
      title: "Customer account — Forma",
      description: "Your orders and delivery addresses.",
    };
  if (path === "/account")
    return {
      title: "Account settings — Forma",
      description: "Manage your account security and local data.",
    };
  if (pageMeta[path]) return pageMeta[path];
  const guide = guides.find((guide) => path === `/help/${guide.id}`);
  if (guide)
    return {
      title: `${guide.title} — Forma guides`,
      description: guide.steps[0][1],
    };
  const template = collections.find((item) => path === `/templates/${item.id}`);
  if (template)
    return {
      title: `${template.name} template — Forma`,
      description: template.subtitle,
    };
  return {
    title: "Page not found — Forma",
    description: "Find your way back to Forma.",
  };
}

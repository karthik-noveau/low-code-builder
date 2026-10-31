// Every route the API serves, in one list. infra/template.mjs makes the HTTP
// API's routes and per-route throttles from it, and the local server refuses
// to answer a route that isn't here (backend/api.ts), so a route the backend
// handles can't go missing from AWS without local tests failing.
//
// - `id` is the CloudFormation logical ID. Never rename or reuse one: a new ID
//   for an existing route key makes CloudFormation create a duplicate route
//   before deleting the old one, and the deploy fails.
// - `auth: "jwt"` routes need a Cognito access token (owner and team routes);
//   `"none"` routes are public and get their own `throttle` (burst, rate/s) so
//   visitors can't use up the editor's budget.
// - `localOnly` routes are served by the local server only; the reason says why
//   they aren't in the AWS template.

/** @type {import("./api-routes.d.mts").ApiRoute[]} */
export const apiRoutes = [
  { id: "Route0", route: "GET /sites", auth: "jwt" },
  { id: "Route1", route: "POST /sites", auth: "jwt" },
  { id: "Route2", route: "GET /sites/{id}", auth: "jwt" },
  { id: "Route3", route: "GET /sites/{id}/draft", auth: "jwt" },
  { id: "Route4", route: "PUT /sites/{id}/draft", auth: "jwt" },
  { id: "Route5", route: "GET /sites/{id}/releases", auth: "jwt" },
  { id: "Route6", route: "GET /sites/{id}/domains", auth: "jwt" },
  { id: "Route7", route: "POST /sites/{id}/domains", auth: "jwt" },
  {
    id: "Route8",
    route: "POST /sites/{id}/domains/{domainId}/check",
    auth: "jwt",
  },
  {
    id: "Route9",
    route: "POST /sites/{id}/domains/{domainId}/retry",
    auth: "jwt",
  },
  {
    id: "Route10",
    route: "POST /sites/{id}/domains/{domainId}/disconnect",
    auth: "jwt",
  },
  {
    id: "Route11",
    route: "POST /sites/{id}/domains/{domainId}/primary",
    auth: "jwt",
  },
  {
    id: "Route12",
    route: "POST /sites/{id}/domains/{domainId}/remove",
    auth: "jwt",
  },
  { id: "Route13", route: "POST /sites/{id}/publish", auth: "jwt" },
  { id: "Route14", route: "POST /sites/{id}/rollback", auth: "jwt" },
  { id: "Route15", route: "POST /sites/{id}/unpublish", auth: "jwt" },
  { id: "Route16", route: "GET /sites/{id}/inbox", auth: "jwt" },
  { id: "Route17", route: "POST /sites/{id}/inbox/{requestId}", auth: "jwt" },
  { id: "Route18", route: "GET /sites/{id}/payments", auth: "jwt" },
  { id: "Route19", route: "POST /sites/{id}/payments", auth: "jwt" },
  { id: "Route20", route: "POST /sites/{id}/payments/disconnect", auth: "jwt" },
  {
    id: "PaymentWebhookSetupRoute",
    route: "POST /sites/{id}/payments/webhook",
    auth: "jwt",
  },
  { id: "Route21", route: "GET /sites/{id}/app", auth: "jwt" },
  { id: "Route22", route: "GET /sites/{id}/app/{proxy+}", auth: "jwt" },
  { id: "Route23", route: "POST /sites/{id}/app/{proxy+}", auth: "jwt" },
  { id: "Route24", route: "PUT /sites/{id}/app/{proxy+}", auth: "jwt" },
  { id: "Route25", route: "GET /account/notifications", auth: "jwt" },
  { id: "Route26", route: "POST /account/notifications", auth: "jwt" },
  { id: "Route27", route: "POST /sites/{id}/payments/sign-in", auth: "jwt" },
  {
    id: "Route28",
    route: "POST /sites/{id}/payments/sign-in/finish",
    auth: "jwt",
  },
  {
    id: "Route29",
    route: "POST /sites/{id}/inbox/{requestId}/refund",
    auth: "jwt",
  },
  {
    id: "Route30",
    route: "POST /sites/{id}/inbox/{requestId}/delete",
    auth: "jwt",
  },
  { id: "Health", route: "GET /health", auth: "none" },
  // Visitor action forms on published sites post here without a token.
  {
    id: "InboxRoute",
    route: "POST /inbox/{id}",
    auth: "none",
    throttle: { burst: 5, rate: 2 },
  },
  // After an order, booking or RSVP, visitors are sent here to see how to pay.
  {
    id: "InboxPaymentRoute",
    route: "GET /inbox/{id}/requests/{requestId}",
    auth: "none",
    throttle: { burst: 5, rate: 2 },
  },
  {
    id: "InboxCheckoutRoute",
    route: "GET /inbox/{id}/requests/{requestId}/checkout",
    auth: "none",
    throttle: { burst: 2, rate: 1 },
  },
  // Stripe or Razorpay sends the owner back here after signing in; the
  // editor then finishes with the owner's token.
  {
    id: "PaymentSignInRoute",
    route: "GET /payments/sign-in/{provider}/return",
    auth: "none",
    throttle: { burst: 5, rate: 2 },
  },
  // Stripe or Razorpay says a checkout was paid: Forma's platform webhook
  // (signed-in accounts) and each site's own (pasted keys). Signed; the API
  // still asks the provider before marking anything paid.
  {
    id: "PaymentWebhookRoute",
    route: "POST /payments/webhooks/{provider}",
    auth: "none",
    throttle: { burst: 20, rate: 10 },
  },
  {
    id: "PaymentSiteWebhookRoute",
    route: "POST /payments/webhooks/{provider}/{id}",
    auth: "none",
    throttle: { burst: 20, rate: 10 },
  },
  // Business app forms, lookups and views on published sites, and the push
  // key. Per-IP lookup limits live in the API; these cap the whole route.
  {
    id: "AppFindRoute",
    route: "GET /apps/{id}/forms/{formId}/find",
    auth: "none",
    throttle: { burst: 10, rate: 5 },
  },
  {
    id: "AppSubmitRoute",
    route: "POST /apps/{id}/forms/{formId}",
    auth: "none",
    throttle: { burst: 5, rate: 2 },
  },
  {
    id: "AppAvailabilityRoute",
    route: "GET /apps/{id}/forms/{formId}/availability",
    auth: "none",
    throttle: { burst: 10, rate: 5 },
  },
  {
    id: "AppPayRoute",
    route: "GET /apps/{id}/records/{recordId}/pay",
    auth: "none",
    throttle: { burst: 5, rate: 2 },
  },
  {
    id: "AppCheckoutRoute",
    route: "GET /apps/{id}/records/{recordId}/checkout",
    auth: "none",
    throttle: { burst: 2, rate: 1 },
  },
  {
    id: "AppViewRoute",
    route: "GET /apps/{id}/views/{viewId}",
    auth: "none",
    throttle: { burst: 10, rate: 5 },
  },
  {
    id: "AppMetricsRoute",
    route: "GET /apps/{id}/metrics",
    auth: "none",
    throttle: { burst: 10, rate: 5 },
  },
  {
    id: "PushKeyRoute",
    route: "GET /push/key",
    auth: "none",
    throttle: { burst: 10, rate: 5 },
  },

  // Forma Store: the owner's store workspace (roles are checked in the API).
  { id: "CommerceRoute", route: "GET /sites/{id}/commerce", auth: "jwt" },
  {
    id: "CommerceCatalogRoute",
    route: "GET /sites/{id}/commerce/catalog",
    auth: "jwt",
  },
  {
    id: "CommerceSettingsRoute",
    route: "PUT /sites/{id}/commerce/settings",
    auth: "jwt",
  },
  {
    id: "CommerceProductsRoute",
    route: "POST /sites/{id}/commerce/products",
    auth: "jwt",
  },
  {
    id: "CommerceDiscountsRoute",
    route: "POST /sites/{id}/commerce/discounts",
    auth: "jwt",
  },
  {
    id: "CommerceContentRoute",
    route: "POST /sites/{id}/commerce/content",
    auth: "jwt",
  },
  {
    id: "CommerceOrderRoute",
    route: "POST /sites/{id}/commerce/orders/{orderId}",
    auth: "jwt",
  },
  {
    id: "CommerceMembersRoute",
    route: "POST /sites/{id}/commerce/members",
    auth: "jwt",
  },
  {
    id: "CommerceMemberRemoveRoute",
    route: "POST /sites/{id}/commerce/members/{memberId}/remove",
    auth: "jwt",
  },
  {
    id: "CommerceExportRoute",
    route: "GET /sites/{id}/commerce/export",
    auth: "jwt",
  },
  {
    id: "CommerceIntegrationsRoute",
    route: "POST /sites/{id}/commerce/integrations",
    auth: "jwt",
  },
  {
    id: "CommerceIntegrationEventsRoute",
    route: "GET /sites/{id}/commerce/integrations/{integrationId}/events",
    auth: "jwt",
  },
  {
    id: "CommerceCampaignRoute",
    route: "POST /sites/{id}/commerce/campaign-preview",
    auth: "jwt",
  },
  // Forma Store: the storefront, called by shoppers without a token.
  {
    id: "StoreRoute",
    route: "GET /store/{id}",
    auth: "none",
    throttle: { burst: 20, rate: 10 },
  },
  {
    id: "StoreEventsRoute",
    route: "POST /store/{id}/events",
    auth: "none",
    throttle: { burst: 10, rate: 5 },
  },
  {
    id: "StoreCartRoute",
    route: "POST /store/{id}/cart",
    auth: "none",
    throttle: { burst: 10, rate: 5 },
  },
  {
    id: "StoreCartReadRoute",
    route: "POST /store/{id}/cart/read",
    auth: "none",
    throttle: { burst: 10, rate: 5 },
  },
  {
    id: "StoreCheckoutRoute",
    route: "POST /store/{id}/checkout",
    auth: "none",
    throttle: { burst: 5, rate: 2 },
  },
  {
    id: "StoreFormsRoute",
    route: "POST /store/{id}/forms",
    auth: "none",
    throttle: { burst: 5, rate: 2 },
  },
  {
    id: "StoreUnsubscribeRoute",
    route: "POST /store/{id}/unsubscribe",
    auth: "none",
    throttle: { burst: 5, rate: 2 },
  },
  {
    id: "StoreReceiptRoute",
    route: "POST /store/{id}/orders/{orderId}/receipt",
    auth: "none",
    throttle: { burst: 10, rate: 5 },
  },
  {
    id: "StoreReturnRoute",
    route: "POST /store/{id}/orders/{orderId}/return",
    auth: "none",
    throttle: { burst: 5, rate: 2 },
  },
  // A shopper's account, signed in with a Forma session (the API answers
  // 503 on AWS until customer sign-in has its own identity provider).
  { id: "StoreAccountRoute", route: "GET /store/{id}/account", auth: "jwt" },
  {
    id: "StoreAccountSaveRoute",
    route: "POST /store/{id}/account",
    auth: "jwt",
  },
  {
    id: "StoreProfileRoute",
    route: "GET /store/{id}/account/profile",
    auth: "jwt",
  },
  {
    id: "StoreProfileSaveRoute",
    route: "POST /store/{id}/account/profile",
    auth: "jwt",
  },
  {
    id: "StoreAccountReturnRoute",
    route: "POST /store/{id}/account/orders/{orderId}/return",
    auth: "jwt",
  },

  // Served by the local server only.
  {
    route: "POST /store/{id}/orders/{orderId}/pay-local",
    auth: "none",
    localOnly:
      "Sandbox payment: it marks an order paid without taking money, so it must never be reachable on a hosted store.",
  },
  {
    route: "POST /sites/{id}/delete",
    auth: "jwt",
    localOnly:
      "Permanent deletion needs the production retention workflow (BatchWriteItem, S3 cleanup, backups).",
  },
  {
    route: "POST /sites/{id}/domains/{domainId}/local-dns",
    auth: "jwt",
    localOnly: "The local DNS simulator.",
  },
  {
    route: "DELETE /sites/{id}/inbox/{requestId}",
    auth: "jwt",
    localOnly:
      "Browsers use POST …/delete: the HTTP API's CORS policy allows only GET, POST and PUT.",
  },
  ...[
    "POST /auth/register",
    "POST /auth/login",
    "POST /auth/forgot",
    "POST /auth/reset",
    "POST /auth/logout",
    "GET /auth/me",
    "POST /account/password",
    "POST /account/delete",
    "POST /account/logout-all",
  ].map((route) => ({
    route,
    auth: /** @type {const} */ ("none"),
    outsideApi: true,
    localOnly:
      "Local email/password accounts (backend/local-auth.ts); AWS uses Cognito hosted sign-in.",
  })),
];

const compiled = apiRoutes.map((entry) => {
  const [method, path] = entry.route.split(" ");
  return { entry, method, parts: path.split("/").slice(1) };
});
/**
 * The declared route API Gateway would pick for a request: `{name}` is one
 * path segment, `{name+}` the rest of the path; literal routes win over
 * parameters, and parameters over greedy ones.
 */
export function matchRoute(method, path) {
  const segments = path.split("/").slice(1);
  let best, bestScore;
  for (const { entry, method: m, parts } of compiled) {
    if (m !== method) continue;
    const greedy = /^\{[^}]+\+\}$/.test(parts.at(-1) || "");
    if (
      greedy ? segments.length < parts.length : segments.length !== parts.length
    )
      continue;
    let score = greedy ? 1000 : 0,
      ok = true;
    for (let i = 0; i < parts.length - (greedy ? 1 : 0) && ok; i++) {
      if (!segments[i]) ok = false;
      else if (/^\{[^}]+\}$/.test(parts[i])) score += 1;
      else ok = parts[i] === segments[i];
    }
    if (greedy && !segments.slice(parts.length - 1).every(Boolean)) ok = false;
    if (!ok) continue;
    if (best === undefined || score < bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  return best;
}

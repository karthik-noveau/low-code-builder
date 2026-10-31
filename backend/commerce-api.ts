import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { HttpError, idPattern, insist, local } from "./config";
import { allow, siteAccess } from "./access";
import { audit, event, list, now, put, read, transact } from "./commerce-data";
import {
  addMember,
  checkout,
  digest,
  ensureStore,
  getCart,
  object,
  orderAction,
  payLocal,
  publicOrder,
  quote,
  receiptOrder,
  removeMember,
  saveCart,
  saveContent,
  saveDiscount,
  saveProduct,
  saveSettings,
  storefront,
  storefrontEnabled,
  settings,
  submitForm,
  unsubscribe,
  requestReturn,
  text,
} from "./commerce";
import type { ApiRequest } from "./api";
import { requireNotDeleting } from "./lifecycle";
import { deliverMail } from "./mail";
import { storeOnWebsite, websiteProducts } from "./commerce-publishing";
import type {
  Address,
  AuditEvent,
  CommerceOverview,
  ContentEntry,
  Customer,
  Discount,
  Integration,
  Member,
  OutboxMessage,
  Product,
  Submission,
} from "../src/commerce/types";

function body(request: ApiRequest) {
  insist(request.body.length <= 256 * 1024, 413, "Request exceeds 256 KB.");
  try {
    return object(JSON.parse(request.body.toString() || "{}"));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Invalid JSON.");
  }
}
export async function overview(
  actor: string,
  siteId: string,
): Promise<CommerceOverview> {
  const { access, stored } = await ensureStore(actor, siteId);
  const [
    products,
    privateOrders,
    customers,
    discounts,
    content,
    submissions,
    auditRows,
    outbox,
    members,
    privateIntegrations,
    metrics,
  ] = await Promise.all([
    list<Product>(siteId, "PRODUCT"),
    list<Parameters<typeof publicOrder>[0]>(siteId, "ORDER"),
    list<Customer>(siteId, "CUSTOMER"),
    list<Discount>(siteId, "DISCOUNT"),
    list<ContentEntry>(siteId, "CONTENT"),
    list<Submission>(siteId, "SUBMISSION"),
    list<AuditEvent>(siteId, "AUDIT", 5000),
    list<OutboxMessage>(siteId, "MAIL", 5000),
    list<Member>(siteId, "MEMBER"),
    list<Integration & { secret: string }>(siteId, "INTEGRATION"),
    list<{ name: string; count: number }>(siteId, "METRIC"),
  ]);
  const orders = privateOrders
    .map(publicOrder)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const currencyTotals: Record<string, number> = {};
  for (const order of orders)
    if (order.status === "paid" || order.status === "fulfilled")
      currencyTotals[order.currency] =
        (currencyTotals[order.currency] || 0) + order.total;
  const { owner: _owner, ...store } = stored;
  void _owner;
  return {
    settings: store,
    products,
    orders,
    customers,
    discounts,
    content,
    submissions,
    audit: auditRows
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 200),
    outbox: outbox
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 200),
    members,
    integrations: privateIntegrations.map(({ secret: _secret, ...item }) => {
      void _secret;
      return item;
    }),
    role: access.role,
    usage: {
      products: products.length,
      orders: orders.length,
      submissions: submissions.length,
      storageBytes: Buffer.byteLength(
        JSON.stringify({
          products,
          privateOrders,
          customers,
          discounts,
          content,
          submissions,
          auditRows,
          outbox,
          members,
          privateIntegrations,
        }),
      ),
      currencyTotals,
    },
    analytics: {
      events: Object.fromEntries(metrics.map((m) => [m.name, m.count])),
      paidOrders: orders.filter(
        (o) => o.status === "paid" || o.status === "fulfilled",
      ).length,
      returningCustomers: customers.filter((c) => c.orders > 1).length,
    },
  };
}
/** Store routes; whatever a change wrote to the outbox is sent afterwards. */
export async function commerceApi(
  request: ApiRequest,
): Promise<{ value: unknown; status?: number } | undefined> {
  const result = await storeRoutes(request);
  const site = /^\/(?:store|sites)\/([^/]+)/.exec(request.path)?.[1];
  if (result && site && request.method !== "GET" && idPattern.test(site))
    await deliverMail(site);
  return result;
}
async function storeRoutes(
  request: ApiRequest,
): Promise<{ value: unknown; status?: number } | undefined> {
  const { method, path, owner: actor } = request;
  const publicMatch = /^\/store\/([^/]+)(?:\/(.*))?$/.exec(path);
  if (publicMatch) {
    const [, siteId, action = ""] = publicMatch;
    insist(idPattern.test(siteId), 404, "Store not found.");
    if (!action && method === "GET") return { value: await storefront(siteId) };
    const input = method === "POST" ? body(request) : {};
    if (action === "events" && method === "POST") {
      await storefrontEnabled(siteId);
      insist(
        typeof input.id === "string" &&
          idPattern.test(input.id) &&
          ["store.visit", "product.view", "store.search"].includes(
            String(input.name),
          ),
        422,
        "Invalid analytics event.",
      );
      if (!(await read(siteId, "ANALYTICS", input.id)))
        await transact([
          put(siteId, "ANALYTICS", input.id, {
            name: input.name,
            expires: Math.floor(Date.now() / 1000) + 86400,
          }),
          event(siteId, String(input.name)),
        ]);
      return { value: { ok: true } };
    }
    if (action === "account" || action === "account/profile") {
      insist(local, 503, "Live customer accounts are not configured.");
      insist(
        actor && request.email,
        401,
        "Sign in to view your customer account.",
      );
      const store = await settings(siteId);
      insist(store, 404, "Store not found.");
      await requireNotDeleting(store.owner, siteId);
      const customerId = digest(request.email);
      const previous = await read<{ revision: number; addresses: Address[] }>(
        siteId,
        "PROFILE",
        customerId,
      );
      if (method === "GET")
        return {
          value: {
            email: request.email,
            revision: previous?.revision || 0,
            addresses: previous?.addresses || [],
            orders:
              action === "account/profile"
                ? []
                : (
                    await list<Parameters<typeof publicOrder>[0]>(
                      siteId,
                      "ORDER",
                    )
                  )
                    .filter((order) => order.email === request.email)
                    .map(publicOrder),
          },
        };
      if (method === "POST") {
        insist(
          input.revision === (previous?.revision || 0),
          409,
          "Your profile changed. Refresh first.",
        );
        insist(
          Array.isArray(input.addresses) && input.addresses.length <= 5,
          422,
          "Save up to five addresses.",
        );
        const addresses = input.addresses.map((raw) => {
          const value = object(raw);
          const country = text(value.country, "country", 2);
          insist(
            /^[A-Z]{2}$/.test(country),
            422,
            "Use a two-letter country code.",
          );
          return {
            name: text(value.name, "name", 100),
            line1: text(value.line1, "address", 200),
            city: text(value.city, "city", 100),
            postalCode: text(value.postalCode, "postal code", 30),
            country,
          };
        });
        await transact([
          put(
            siteId,
            "PROFILE",
            customerId,
            { addresses, revision: (previous?.revision || 0) + 1 },
            previous?.revision,
          ),
        ]);
        return { value: { ok: true } };
      }
    }
    const accountReturn = /^account\/orders\/([^/]+)\/return$/.exec(action);
    if (accountReturn && method === "POST") {
      insist(local, 503, "Live customer accounts are not configured.");
      insist(actor && request.email, 401, "Sign in to request a return.");
      return {
        value: {
          order: await requestReturn(siteId, accountReturn[1], input.reason, {
            email: request.email,
          }),
        },
      };
    }
    if (action === "unsubscribe" && method === "POST")
      return { value: await unsubscribe(siteId, input) };
    if (action === "cart" && method === "POST")
      return {
        value: await saveCart(
          siteId,
          input,
          input.token ? text(input.token, "cart token", 64) : undefined,
        ),
      };
    if (action === "cart/read" && method === "POST") {
      const cart = await getCart(siteId, text(input.token, "cart token", 64));
      return { value: { cart, quote: (await quote(siteId, cart)).quote } };
    }
    if (action === "checkout" && method === "POST")
      return { value: await checkout(siteId, input), status: 201 };
    if (action === "forms" && method === "POST")
      return { value: await submitForm(siteId, input), status: 201 };
    const orderMatch = /^orders\/([^/]+)\/(receipt|pay-local|return)$/.exec(
      action,
    );
    if (orderMatch && method === "POST") {
      insist(idPattern.test(orderMatch[1]), 404, "Order not found.");
      return {
        value: {
          order:
            orderMatch[2] === "return"
              ? await requestReturn(siteId, orderMatch[1], input.reason, {
                  receipt: text(input.receipt, "receipt token", 64),
                })
              : orderMatch[2] === "receipt"
                ? await receiptOrder(
                    siteId,
                    orderMatch[1],
                    text(input.receipt, "receipt token", 64),
                  )
                : await payLocal(siteId, orderMatch[1], input),
        },
      };
    }
    throw new HttpError(404, "Store endpoint not found.");
  }
  const match = /^\/sites\/([^/]+)\/commerce(?:\/(.*))?$/.exec(path);
  if (!match) return undefined;
  insist(actor, 401, "Sign in to continue.");
  const [, siteId, action = ""] = match;
  insist(idPattern.test(siteId), 404, "Site not found.");
  if (!action && method === "GET")
    return { value: await overview(actor, siteId) };
  // The editor's store repeats: the products published pages would show
  // (read only, so opening the editor never sets up a store).
  if (action === "catalog" && method === "GET") {
    await siteAccess(actor, siteId);
    const stored = await settings(siteId);
    const open = storeOnWebsite(stored);
    return {
      value: {
        open,
        website: open && !!stored?.useCatalogOnWebsite,
        products: open && stored ? await websiteProducts(siteId, stored) : [],
      },
    };
  }
  const input = method === "POST" || method === "PUT" ? body(request) : {};
  if (action === "settings" && method === "PUT")
    return { value: { settings: await saveSettings(actor, siteId, input) } };
  if (action === "products" && method === "POST")
    return { value: { product: await saveProduct(actor, siteId, input) } };
  if (action === "discounts" && method === "POST")
    return { value: { discount: await saveDiscount(actor, siteId, input) } };
  if (action === "content" && method === "POST")
    return { value: { entry: await saveContent(actor, siteId, input) } };
  if (action === "members" && method === "POST")
    return { value: await addMember(actor, siteId, input) };
  const memberMatch = /^members\/([^/]+)\/remove$/.exec(action);
  if (memberMatch && method === "POST")
    return { value: await removeMember(actor, siteId, memberMatch[1]) };
  const orderMatch = /^orders\/([^/]+)$/.exec(action);
  if (orderMatch && method === "POST")
    return {
      value: { order: await orderAction(actor, siteId, orderMatch[1], input) },
    };
  if (action === "export" && method === "GET") {
    const access = await siteAccess(actor, siteId);
    allow(access, "owner");
    return {
      value: {
        format: "forma-commerce-v1",
        exportedAt: now(),
        data: await overview(actor, siteId),
      },
    };
  }
  if (action === "integrations" && method === "POST") {
    const access = await siteAccess(actor, siteId);
    allow(access, "owner");
    const id = input.id ? text(input.id, "integration ID", 36) : randomUUID();
    insist(idPattern.test(id), 422, "Invalid integration ID.");
    const prior = await read<Integration & { secret: string }>(
      siteId,
      "INTEGRATION",
      id,
    );
    insist(
      !prior || input.revision === prior.revision,
      409,
      "Integration changed.",
    );
    const supported = [
      "order.paid",
      "order.fulfilled",
      "order.refunded",
      "product.updated",
    ];
    insist(
      Array.isArray(input.events) &&
        input.events.length > 0 &&
        input.events.every((e) => supported.includes(String(e))),
      422,
      "Choose supported integration events.",
    );
    const secret = prior?.secret || randomBytes(32).toString("hex");
    const integration: Integration = {
      id,
      revision: (prior?.revision || 0) + 1,
      name: text(input.name, "integration name", 80),
      events: input.events as string[],
      enabled: input.enabled === true,
    };
    await transact([
      put(
        siteId,
        "INTEGRATION",
        id,
        { ...integration, secret },
        prior?.revision,
      ),
      audit(siteId, actor, "integration.saved", id),
    ]);
    return { value: { integration, ...(!prior ? { secret } : {}) } };
  }
  const eventMatch = /^integrations\/([^/]+)\/events$/.exec(action);
  if (eventMatch && method === "GET") {
    const access = await siteAccess(actor, siteId);
    allow(access, "owner");
    const integration = await read<Integration & { secret: string }>(
      siteId,
      "INTEGRATION",
      eventMatch[1],
    );
    insist(integration?.enabled, 404, "Integration not enabled.");
    const records = (await list<AuditEvent>(siteId, "AUDIT", 5000))
      .filter((item) => integration.events.includes(item.action))
      .slice(-100);
    return {
      value: {
        events: records.map((item) => {
          const payload = JSON.stringify(item);
          return {
            id: item.id,
            payload,
            signature: createHmac("sha256", integration.secret)
              .update(payload)
              .digest("hex"),
          };
        }),
        mode: "local-pull",
      },
    };
  }
  if (action === "campaign-preview" && method === "POST") {
    const access = await siteAccess(actor, siteId);
    allow(access, "manage");
    const subject = text(input.subject, "subject", 160),
      content = text(input.body, "email body", 5000);
    const subscribers = (await list<Submission>(siteId, "SUBMISSION")).filter(
      (s) => s.kind === "newsletter" && s.consent,
    );
    return {
      value: {
        subject,
        body: content,
        recipients: subscribers.map((s) => s.email),
        count: subscribers.length,
        delivery: "preview-only",
      },
    };
  }
  throw new HttpError(404, "Commerce endpoint not found.");
}

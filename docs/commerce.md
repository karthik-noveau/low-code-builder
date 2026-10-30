# Local commerce implementation and release status

The new commerce workspace is implemented for local development. It is not Shopify parity, and it is not production-ready. Live provider integrations, scaling work and AWS verification remain release requirements, tracked in `release-readiness.json`. Neither successful local tests nor changing that manifest substitutes for implementing and verifying those integrations.

## Try the flow

1. Run `npm run local:start`, open `http://localhost:5178`, and create or sign into a local account.
2. Create a website. Open **Manage store** from its workspace card.
3. Add products with variants, integer inventory quantities, and prices. Activate the products.
4. In **Markets**, review base currency, supported countries, explicit regional prices, flat shipping, free-shipping threshold and manual tax percentage. Enable the local storefront.
5. Open the storefront, add a variant, edit the cart, apply a discount and start checkout. Try a declined payment, then an approved payment.
6. In **Orders**, fulfill the paid order with a tracking reference or refund it, optionally restoring stock.
7. Check customer records, analytics, activity history and email previews. Submit a contact message or newsletter signup from the storefront.

In Markets, optionally enable a Shop header button and catalog-backed published product sections. Publishing then fills product sections with the first 12 active products, linked to their storefront views. Website drafts retain their original content. Catalog-content changes invalidate publish deduplication, while stock-only changes do not rebuild static pages. Custom-domain storefront routing and production storefront SEO remain outstanding.

## On AWS

A hosted deployment runs the same store code in the API Lambda (`FORMA_MODE=aws`). The storefront (`/store?site=`), customer account (`/customer?site=`) and store workspace (`/commerce?site=`) are prerendered editor pages (`dist/store`, `dist/customer`, `dist/commerce`) served by the editor's CloudFront distribution like every other workspace page; they call the HTTP API at the `apiUrl` in `cloud-config.json`. Every store route is declared in `infra/api-routes.mjs` (see [deployment](deployment.md#forma-store-on-aws)).

| Works the same as locally                                                                                                                  | Closed on AWS, and why                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Store workspace: products, variants, stock, markets, discounts, journal content, orders (fulfil, cancel, returns), export, campaign preview | **Checkout** (`POST /store/{id}/checkout` answers 503). Locally an order is paid with a sandbox button; a public store can't offer that, and real payment needs decisions not yet made (see below).                                                                    |
| Storefront: catalogue, product views, search/visit analytics, cart, discounts, server-side quotes, receipts and receipt-based returns       | **Sandbox payment** (`…/orders/{orderId}/pay-local`): not on the HTTP API at all, and 404 in AWS mode.                                                                                                                                                                  |
| Contact messages and newsletter sign-ups with unsubscribe links; email previews in the outbox (no email is sent in either mode)            | **Refunds** of orders (503): there are no paid orders without checkout.                                                                                                                                                                                                 |
| The website's Shop button and catalogue-backed product sections when publishing (links point at `EDITOR_ORIGIN/store`)                     | **Customer accounts** (`/store/{id}/account…`, 503): they need the shopper's email from a verified sign-in. Cognito access tokens carry no email and the pool is invitation-only for site owners; shoppers need their own identity provider (release item `identity`). |
| Integration event feed (signed pull)                                                                                                       | **Adding collaborators** (503): it looks up a local account by email; Cognito users need an `AdminGetUser`/`ListUsers` lookup and invitation flow first.                                                                                                                 |

A product linked from the website (`/store?site=…&product=…`) opens the catalogue showing just that product with **See all products**; choosing a collection, searching or **Shop** shows the whole catalogue again and drops `product` from the address.

The storefront payload says what the host can do (`sandbox`, `checkout`, `accounts`). On AWS the cart says the store doesn't take online orders yet and points to the contact form, and the footer hides **Your account**; opening `/customer?site=` directly says customer accounts aren't open yet instead of offering a sign-in. Website deletion stays local-only (backend guide).

Online checkout for orders could reuse the Inbox's owner-account payments (`createCheckout`, `checkoutPaid` and `refundCheckout` in `backend/payments.ts`), but orders reserve stock and the Inbox has none, so these need deciding first: whether stock is held while the shopper is at Stripe/Razorpay; what happens when stock or prices change after the provider has taken the money (refund automatically, or accept and oversell); and how an order is confirmed when the shopper never comes back (no webhooks yet, so the owner would need a **Check payment** in Orders as the Inbox has).

Without the local server's per-IP limit (180 store/inbox/app posts a minute), public store routes are capped per route in API Gateway (`throttle` in `infra/api-routes.mjs`): the storefront read at 10/s (burst 20), cart, cart read, analytics and receipts at 5/s (burst 10), checkout, forms, unsubscribe and returns at 2/s (burst 5). Carts and analytics markers expire through the table's `expires` TTL.

`tests/integration/hosted-store.test.ts` drives these routes through the Lambda handler with API Gateway–shaped events, in AWS mode, against a throwaway DynamoDB Local table (every other AWS endpoint is a dead loopback port). It can't check IAM, throttling, CORS or CloudFront; that needs a real staging deployment.

## Data and transaction boundaries

Commerce records use partition `COMMERCE#{siteId}` with typed sort-key prefixes. No table scans are used. Catalog prices are integer minor units. Currently USD, EUR, GBP, INR, CAD and AUD are supported, all with two decimal places. Currency conversion is never inferred: a variant needs an explicit price for a foreign-currency market.

Cart and receipt capabilities use 32 random bytes; cart lookup keys and receipt validation store SHA-256 hashes. Receipt access is a bearer capability and should be treated as private. Cart mutation uses optimistic revisions. A checkout is idempotent for a cart revision. Paid transitions atomically update the order, payment ledger, inventory revisions, consumed cart, limited discount, customer aggregate, activity event and local email outbox. A stock or price change rejects an obsolete checkout. Repeated successful payment calls do not charge or decrement stock again.

The local payment API does not accept card data. It never calls a financial provider. Live checkout/refund code fails closed. Shipping and tax are merchant-configured test rules; carrier rates, tax jurisdiction logic, real labels, partial refunds and reconciliation remain unfinished. Shoppers can request a whole-order return, the merchant can approve or reject it, and a full refund closes it. Newsletter welcome previews contain single-use unsubscribe links; unsubscribed addresses are excluded from campaign previews.

Store events count visits, carts, started checkouts, paid orders, fulfillment and refunds. Revenue is grouped by currency, excluding refunded orders. These are local operational metrics, not provider settlement reports. Usage displays record counts and an approximate serialized record size, not metered cloud cost or an invoice.

The catalog is limited to 500 products and 50 variants per product; carts support 20 variant lines and quantities up to 99. Markets are limited to eight. Current admin queries load bounded collections (1,000 records per kind; activity/outbox up to 5,000) and fail explicitly if exceeded. A production implementation needs paginated lists, indexed reporting, retention, asynchronous exports and load verification before lifting those bounds.

## Authentication and deletion

Local email/password authentication uses scrypt and hashed, expiring session tokens. Password changes and recovery invalidate older sessions through a credential generation. Recovery links are single-use and expire after 30 minutes. Local recovery messages are written with private filesystem permissions under `.local/data/mail`; unauthenticated callers never receive the reset token. Public email verification, MFA and production delivery are not implemented by these local helpers.

An owner can add an existing local account as manager, editor or viewer. Managers can manage orders/settings and publish; editors can edit products, content and website drafts; viewers are read-only. Domain operations, collaborator administration, exports and deletion require the owner. A revoked member loses API access. This is role-based collaboration, not simultaneous editing.

Local site deletion is explicit and permanent. First unpublish and remove domain connections, export anything to retain, then confirm the website name. A durable deletion marker prevents new commerce transactions while files and records are removed; retry an interrupted deletion. Account deletion requires removal of owned websites, a password check and an email confirmation phrase. Session tokens stop working once the account is removed. Minimal deletion markers remain to prevent in-flight writes from recreating deleted resources.

## Backups and recovery

Stop local services before taking a snapshot so DynamoDB's SQLite files are consistent:

```sh
npm run local:stop
npm run local:backup -- create
npm run local:start
```

The command prints the backup directory. Backups include local database, drafts, releases and local recovery mail. Protect them like credentials. They are not encrypted by the application and are not uploaded anywhere.

```sh
npm run local:backup -- verify --source /absolute/path/to/backup
npm run local:backup -- restore --source /absolute/path/to/backup --destination /new/empty/data-directory
FORMA_DATA_DIR=/new/empty/data-directory npm run dev:local
```

Every file is hashed. Verification rejects modified, extra, missing or unsafe entries. Restore refuses existing destination directories. Automated encrypted offsite backups, production retention and recovery drills are separate outstanding production work.

## Release requirements

`scripts/deploy-aws.mjs` and the deployment workflow enforce the manifest before provisioning anything. CI still runs unit/integration checks against DynamoDB Local. The AWS template now routes every store endpoint (above), but it has not been deployed and verified, and customer identity, live payments, deletion and reporting workloads are still missing on AWS.

Remaining work includes live payments and signed provider webhooks; automated settlement/refund reconciliation; production email delivery and deliverability management; carrier/tax services; SaaS usage metering and billing collection; hosted signup/recovery/MFA; production deletion/retention; monitoring, budgets and offsite recovery; paginated reporting and load tests; live domain storefront routing; broader dynamic theme/CMS capabilities; POS, marketplace connectors and a supported extension ecosystem. These must not be represented as complete because local simulations or previews exist.

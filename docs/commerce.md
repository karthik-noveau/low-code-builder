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

| Works the same as locally                                                                                                                                                              | Closed on AWS, and why                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Store workspace: products, variants, stock, markets, discounts, journal content, orders (fulfil, cancel, returns, refunds of paid orders), export, campaign preview                    | **Sandbox payment** (`…/orders/{orderId}/pay-local`): not on the HTTP API at all, and 404 in AWS mode. Checkout needs the owner's Stripe or Razorpay (below).                                                                                                          |
| Storefront: catalogue, product views, search/visit analytics, cart, discounts, server-side quotes, checkout through the owner's Stripe or Razorpay, receipts and receipt-based returns |                                                                                                                                                                                                                                                                        |
| Contact messages and newsletter sign-ups with unsubscribe links; shopper emails (order confirmations, refunds, returns, newsletter welcome) sent through Amazon SES when `MAIL_FROM` is set, previews in the outbox otherwise                                                        |                                                                                                                                                                                                                                                                        |
| The website's Shop button and catalogue-backed product sections when publishing (links point at `EDITOR_ORIGIN/store`)                                                                 | **Customer accounts without an email sender** (`/store/{id}/account/code`, 503): shoppers sign in with a code sent by email, so a stack without `MAIL_FROM` doesn't offer them.                                                                                           |
| Integration event feed (signed pull)                                                                                                                                                   |                                                                                                                                                                                                                                                                        |
| Customer accounts (sign-in by emailed code, below) and adding collaborators (found in, or invited to, the stack's Cognito pool)                                                       |                                                                                                                                                                                                                                                                        |

Every product has its own page at `/store?site=…&product=…` (what the website links to): the photo large, the options as buttons, a quantity, how many are left when it's three or fewer, the whole description, delivery for the shopper's market, and up to three more from its collection. Cards in the catalogue link to it, Back returns, and each page opened counts once per visit as `product.view`. A link to a product that's gone or hidden shows the whole catalogue. Store pages scroll themselves (`.commerce-app` outside the workspace), since the app pins the window.

The storefront payload says what the host can do (`sandbox`, `checkout`, `accounts`). Without a payment connection, on AWS the cart says the store doesn't take online orders yet and points to the contact form. Without an email sender the footer hides **Your account**, and opening `/customer?site=` directly says customer accounts aren't open yet instead of offering a sign-in.

## Customer accounts

Shoppers sign in to one store at a time, with no password and no Forma account (`backend/shoppers.ts`). On `/customer?site=` they enter their email; `POST /store/{id}/account/code` emails a six-digit code (stored hashed, ten minutes, one ask every 30 seconds and five an hour per address), and `POST /store/{id}/account/session` swaps it for a random token. Five wrong guesses use the code up, and a code works once. The token is kept in the browser for that store only, sent in the body of `…/account/read`, `…/account` (saved addresses), `…/account/orders/{orderId}/return` and `…/account/sign-out`, and lasts 30 days. Orders are found by email through a `BUYER` index written with each order (older orders by a scan). Locally without `MAIL_FROM`, the code is shown on the page instead of sent. Website deletion stays local-only (backend guide).

## Moving a store from Shopify or Wix

Store → Import & migrate reads exports as the old platform produces them (`src/commerce/migrate.ts`): Shopify's products and customers CSVs, Wix's `catalog_products.csv` and contacts CSV, and Forma's own product template. The file is parsed in the browser and previewed, with notes on what doesn't come across (compare-at prices, Wix discounts, untracked stock, variants beyond 50), before anything is saved.

- Products are created one by one through `POST /sites/{id}/commerce/products`; a product whose handle or title is already in the catalogue is skipped, so a second run finishes an interrupted one. The old handle is kept on the product (`handle`).
- Customers go in batches of 200 to `POST /sites/{id}/commerce/customers` (`backend/migration.ts`, owners and managers). They're matched by email; order count and spend from the old store are added once (`imported`), replacing an earlier import from the same platform. Shoppers who accepted marketing become newsletter subscribers with no welcome email; someone who unsubscribed here stays unsubscribed.
- Old addresses keep working. When the store is open, publishing writes a small redirect page at `products/<handle>`, `product-page/<handle>` (Wix), `collections/<slug>`, `category/<slug>`, `collections/all` and `shop`, pointing at the Forma store. Owners add any other old path, or import Shopify's URL redirect CSV, in the editor's Settings → Moved pages (`project.redirects`, `src/studio/redirects.ts`). The site routers (`infra/template.mjs`, `backend/local.ts`) serve `/a/b` (no trailing slash) from `a/b.html`, up to four levels, which also gives every page a clean address. A real page at a path always wins over a redirect.
- Past orders, gift cards and page content aren't imported; pages are rebuilt from a template.

## Search, insights and marketing

- **Search & sharing** (editor Settings, `src/studio/seo.ts`): site address (else the primary domain, else the Forma address), language, share image, business details, social profiles and Google/Bing verification. Pages add their own share image and "Hide from search engines". Published pages carry a canonical link, Open Graph and Twitter cards, `noindex` where asked, and JSON-LD: WebSite and the business on the home page, BreadcrumbList elsewhere, Product on product pages. Each release has `sitemap.xml` and `robots.txt`. Review site lists long, short or repeated titles and descriptions and a missing share image.
- **Product pages**: when the store is open, every active product is published at `products/<slug>` (the Shopify handle if it has one), with its price as Product data and a Buy button into the store. A site page at the same address wins. `insights.js` reads live stock from the public catalogue (`GET /store/{id}`), shows In stock / Only N left / Sold out under the button, and sets the Product data's availability, so stock changes never need a republish.
- **Insights** (`/insights?site=`, `backend/insights.ts`): `insights.js` on published pages posts one page view per load to `POST /track/{id}` without cookies; visitors are counted once a day from a hash of address and browser with a daily salt that expires after two days. Counters live in one `STATS#<day>` row per site (views, visitors, pages, referring sites, utm source/medium/campaign, devices, store events) for about 400 days. Countries come from the browser's time zone (`backend/timezones.ts`), not an IP lookup. Orders keep the campaign or site the shopper came from (`attribution`), so sales show by channel. Owners turn insights off in Settings → Tracking (it takes effect when they publish).
- **Google Analytics 4 and Meta Pixel**: IDs in Settings → Tracking; `insights.js` loads them, after a consent banner by default, and never for visitors sending Do Not Track or Global Privacy Control. The sites' CSP allows exactly those vendors' script and collection hosts. The IDs are also saved with the site's tracking settings at publish and passed to the storefront, which reports `view_item`, `add_to_cart`, `begin_checkout` and `purchase` (Meta: ViewContent, AddToCart, InitiateCheckout, Purchase), each purchase once (`src/commerce/storeTracking.ts`).
- **Marketing** (Store → Marketing, `backend/marketing.ts`): campaigns go only to newsletter subscribers, narrowed to customers, prospects or customers gone 90 days, with no size limit: the browser sends in steps (`POST /sites/{id}/commerce/campaigns`, mode `send`), each reading the next page of subscribers after the campaign's cursor and writing their messages with their own unsubscribe link. Emails are designed HTML (heading, image, button, brand colour, discount code) with a plain-text twin. An A/B campaign gives each half of the audience (split by address) its own subject and tags links `utm_content=a|b`; Insights compares visits and sales per version. Links into the site and store get utm tags. Checkouts that ran out unpaid can be reminded once by hand (order action `remind`), or automatically: every checkout is queued (`REMINDDUE#<created>`), and with Automatic reminders on (store settings `autoRemind`: delay 1–72 hours, optional discount) the queue is swept after store requests, at most once a minute a store.

## Shopper emails

Every store email is written to the outbox in the same transaction as what it's about (`message` in `backend/commerce-data.ts`). With `MAIL_FROM` set to an address SES has verified (stack parameter `MailFrom`, deploy variable `MAIL_FROM`), it starts `pending` and `backend/mail.ts` sends it after the request that wrote it (and after payment webhooks): from the store's name at that address, replies to the store's contact email. Each message is claimed with a conditional write so two requests never send it twice; a stale claim (five minutes) or a failure is retried on a later request, up to five times, then marked `undeliverable`. Without `MAIL_FROM`, messages stay `local-preview`.

Hosted, mail goes through the stack's SES configuration set (`{stack}-mail`, `MAIL_CONFIGURATION_SET`), tagged with the site and message. SES sends bounces and complaints to EventBridge, and a rule invokes the API function (`onMailEvent`): the message is marked `bounced` or `complained`, and an address that bounced for good or complained goes on a Forma-wide suppression list (hashed), so later mail to it is marked `suppressed` and never sent. The configuration set also enables SES's own suppression for those reasons. A new SES account is in the sandbox and only sends to verified addresses until production access is granted. Tests can point `SES_ENDPOINT` at a stand-in locally.

## Checkout through the owner's Stripe or Razorpay

With a payment connection (Settings → Get paid, `backend/payments.ts`), checkout runs through the owner's own account, locally and on AWS alike; the sandbox only stands in locally when there's none (`backend/store-checkout.ts`).

- **Stock is held for 15 minutes.** Starting checkout writes the order, takes its stock and records a `HOLD` in one transaction, then makes a Stripe Checkout Session or Razorpay payment link for the exact total (Stripe keeps one open 30 minutes at least, Razorpay 15). If the provider fails, the stock goes straight back. Pressing pay again for the same cart revision reuses the checkout.
- **Paid means the provider says so**, asked directly (`checkoutPaid`) with the amount checked: when the shopper comes back (`/store?site=…&order=<id>`, the receipt token stays in their browser), when a webhook names the checkout, or when the owner presses **Check payment** in Orders. Paying clears the bought cart, records the payment and customer, and keeps the stock taken.
- **Webhooks** only say which checkout to check (store orders, and Inbox requests and app records too), and are signature-checked first: `POST /payments/webhooks/{provider}/{siteId}` for pasted keys (Stripe's endpoint is made through the key, which needs Webhook Endpoints: Write; for Razorpay the owner adds the URL and a secret Forma made, shown only to the owner), and `POST /payments/webhooks/{provider}` for signed-in accounts (Forma's platform apps, `STRIPE_WEBHOOK_SECRET` and `RAZORPAY_WEBHOOK_SECRET`), which only speak for the site whose connected account sent them.
- **A hold that runs out** is released lazily, a few at a time, whenever the storefront is read or checkout starts: the provider is asked once more, the checkout is cancelled there (Stripe expire, Razorpay cancel), the stock and discount use go back, and the order is cancelled as expired. The shopper's cart is untouched, so they can check out again. An owner cancelling a held order does the same at once.
- **A payment that still lands after release** takes the stock again if it's there; otherwise the order is paid but flagged `stockShort` for the owner to refund. Prices are fixed when checkout starts, so later price changes don't affect a held order.
- **Disconnecting** first closes every held checkout (paid ones recorded, the rest cancelled with stock back). For a day afterwards Forma keeps only what verifies that connection's webhooks (`PAYRETIRED`; for a pasted Stripe key, its webhook endpoint and the sealed key to delete it once the day is over), so a payment for a checkout made before still counts: with no connection to ask, the provider's signed event, for exactly that checkout and the full amount, is the proof.
- **Refunds** can be part or all of a paid order: chosen items (their stock back if asked), shipping, and an amount suggested from those (each item's share of discount and tax) that the owner can lower but never push past what's left. Online payments go back through the provider (owner only), keyed by order and refund number so a retry can't refund twice. The order is "refunded" once its refunds add up to the total.

Without the local server's per-IP limit (300 store/inbox/app posts a minute), public store routes are capped per route in API Gateway (`throttle` in `infra/api-routes.mjs`): the storefront read at 10/s (burst 20), cart, cart read, analytics and receipts at 5/s (burst 10), checkout, forms, unsubscribe and returns at 2/s (burst 5). Carts and analytics markers expire through the table's `expires` TTL.

`tests/integration/hosted-store.test.ts` drives these routes through the Lambda handler with API Gateway–shaped events, in AWS mode, against a throwaway DynamoDB Local table (every other AWS endpoint is a dead loopback port). It can't check IAM, throttling, CORS or CloudFront; that needs a real staging deployment.

## Data and transaction boundaries

Commerce records use partition `COMMERCE#{siteId}` with typed sort-key prefixes. No table scans are used. Catalog prices are integer minor units. Currently USD, EUR, GBP, INR, CAD and AUD are supported, all with two decimal places. Currency conversion is never inferred: a variant needs an explicit price for a foreign-currency market.

Cart and receipt capabilities use 32 random bytes; cart lookup keys and receipt validation store SHA-256 hashes. Receipt access is a bearer capability and should be treated as private. Cart mutation uses optimistic revisions. A checkout is idempotent for a cart revision. Paid transitions atomically update the order, payment ledger, inventory revisions, consumed cart, limited discount, customer aggregate, activity event and local email outbox. A stock or price change rejects an obsolete checkout. Repeated successful payment calls do not charge or decrement stock again.

The local payment API does not accept card data. It never calls a financial provider. Live checkout/refund code fails closed. Shipping and tax are merchant-configured test rules; carrier rates, tax jurisdiction logic, real labels, partial refunds and reconciliation remain unfinished. Shoppers can request a whole-order return, the merchant can approve or reject it, and a full refund closes it. Newsletter welcome previews contain single-use unsubscribe links; unsubscribed addresses are excluded from campaign previews.

Store events count visits, carts, started checkouts, paid orders, fulfillment and refunds. Revenue is grouped by currency, excluding refunded orders. These are local operational metrics, not provider settlement reports. Usage displays record counts and an approximate serialized record size, not metered cloud cost or an invoice.

The catalog is limited to 500 products and 50 variants per product; carts support 20 variant lines and quantities up to 99. Markets are limited to eight. Current admin queries load bounded collections (1,000 records per kind; activity/outbox up to 5,000) and fail explicitly if exceeded. A production implementation needs paginated lists, indexed reporting, retention, asynchronous exports and load verification before lifting those bounds.

## Authentication and deletion

Local email/password authentication uses scrypt and hashed, expiring session tokens. Password changes and recovery invalidate older sessions through a credential generation. Recovery links are single-use and expire after 30 minutes. Local recovery messages are written with private filesystem permissions under `.local/data/mail`; unauthenticated callers never receive the reset token. Public email verification, MFA and production delivery are not implemented by these local helpers.

An owner can add a collaborator as manager, editor or viewer: locally an existing local account; hosted, someone found in the stack's Cognito pool by email, or created there, in which case Cognito emails them a temporary password (`backend/invites.ts`, `cognito-idp:ListUsers` and `AdminCreateUser`). Managers can manage orders/settings and publish; editors can edit products, content and website drafts; viewers are read-only. Domain operations, collaborator administration, exports and deletion require the owner. A revoked member loses API access. This is role-based collaboration, not simultaneous editing.

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

Remaining work includes automated settlement/refund reconciliation; carrier/tax services; SaaS usage metering and billing collection; hosted signup/recovery/MFA; production deletion/retention; monitoring, budgets and offsite recovery; paginated reporting and load tests; live domain storefront routing; broader dynamic theme/CMS capabilities; POS, marketplace connectors and a supported extension ecosystem. These must not be represented as complete because local simulations or previews exist.

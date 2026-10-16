# Local backend

Run `npm run local:setup` once, then `npm run dev:local`. Java 17+ and Node 22.12+ are required. No real AWS credentials are read in local mode. Keep `.local/` private and out of version control.

| Component                  | Local implementation                                                               | AWS implementation                                          |
| -------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Metadata                   | Official DynamoDB Local, persistent SQLite files, AWS SDK v3                       | DynamoDB PAY_PER_REQUEST                                    |
| Authentication             | Local email/password accounts, scrypt hashes, opaque expiring sessions in DynamoDB | Cognito Lite, hosted sign-in, PKCE; HTTP API JWT authorizer |
| Drafts and release objects | Atomic writes to `.local/data/drafts` and `.local/data/sites`                      | Private S3 with SSE-S3                                      |
| Publishing queue           | Durable DynamoDB local queue, retries, local dead-letter records                   | SQS + Lambda, batch size 1, three deliveries, DLQ           |
| Owned domains              | Persisted DNS simulator + hostname preview paths                                   | DNS ownership proof, ACM + CloudFormation + CloudFront      |
| Live routes                | Local HTTP server and route records                                                | CloudFront Function + KeyValueStore + private S3            |

Only DynamoDB is an AWS emulator here. Disk objects, accounts, the queue runner, and the static server are local adapters using the same service and compiler code. They do not simulate Cognito, S3, IAM, Lambda scheduling, or CloudFront propagation. The local runner intentionally cannot run with `FORMA_MODE=aws`; URLs must be loopback addresses. The Java DynamoDB distribution listens on all interfaces, so use a trusted development machine/network; the API and site servers bind to 127.0.0.1. A Docker alternative with a loopback-only port is in `compose.yaml`.

## Ports and persistence

- Editor: `http://127.0.0.1:5178`
- API: `http://127.0.0.1:8787`
- Static previews: `http://127.0.0.1:8788/sites/{siteId}/`
- DynamoDB: `http://127.0.0.1:8008`, table `forma-local`
- Metadata and hashed local sessions: `.local/data/db/`
- Runtime download: `.local/dynamodb/`; generated bundles: `.build/`

No default account is created. Create one in Workspace. Local email addresses are not verified and no emails are sent. Passwords require 10–128 characters. Sessions last eight hours, use random bearer tokens, store only token hashes server-side, and live in browser sessionStorage. Local auth routes are absent from the AWS Lambda entrypoint.

`npm run dev:local -- --backend-only` starts the services without Vite. If a DynamoDB process is already listening at port 8008 it is reused and not terminated. Stop this command with Ctrl+C. Backend source changes require restarting it; Vite hot reload handles frontend changes. The Vite server denies `.local/` and `.build/` and excludes them from file watching, so publishing cannot reload the editor or expose draft files through Vite.

For Docker instead of a Java process: `docker compose up -d`, then `npm run dev:local`. The runner reuses the Docker endpoint. `docker compose stop` preserves its named volume. Java-mode and Docker-mode databases are separate stores.

## API

All `/sites` routes require `Authorization: Bearer <token>`. Identity comes from the verified session/JWT, never from a request owner field.

| Method     | Route                                       | Result                                                                  |
| ---------- | ------------------------------------------- | ----------------------------------------------------------------------- |
| GET        | `/health`                                   | Liveness                                                                |
| POST       | `/auth/register`, `/auth/login`             | Local-only account/session                                              |
| GET / POST | `/auth/me` / `/auth/logout`                 | Local session identity / revoke                                         |
| GET / POST | `/sites`                                    | List owned sites / create `{name}`                                      |
| GET        | `/sites/{id}`                               | Metadata and publication status                                         |
| GET        | `/sites/{id}/draft`                         | Gzip JSON; `x-draft-version` header                                     |
| PUT        | `/sites/{id}/draft`                         | Gzip body, `Content-Type: application/gzip`, numeric `If-Match` version |
| GET        | `/sites/{id}/releases`                      | Retained release history                                                |
| POST       | `/sites/{id}/publish`                       | Queue `{version}`                                                       |
| POST       | `/sites/{id}/rollback`                      | Queue `{version, releaseId}`                                            |
| POST       | `/sites/{id}/unpublish`                     | Queue `{version}`                                                       |
| GET / POST | `/sites/{id}/domains`                       | Owned connections / add `{hostname}`                                    |
| POST       | `/sites/{id}/domains/{domainId}/check`      | Verify ownership, provision HTTPS, probe the bound route                |
| POST       | `/sites/{id}/domains/{domainId}/retry`      | Retry a failed domain stack                                             |
| POST       | `/sites/{id}/domains/{domainId}/primary`    | Select a connected hostname as the displayed publication URL            |
| POST       | `/sites/{id}/domains/{domainId}/disconnect` | Pause this hostname; preserve the website and resources                 |
| POST       | `/sites/{id}/domains/{domainId}/remove`     | Disable routing and remove the domain's certificate/distribution        |
| POST       | `/sites/{id}/domains/{domainId}/local-dns`  | Local-only `{records}` simulator; absent from AWS API routes            |

Errors return `{error}` with 401 unauthenticated, 404 inaccessible/missing, 409 conflict, 413 size, 422 validation, 423 publication lock, or 429 throttled. Unpublishing is reversible. Explicit local deletion is available at `POST /sites/{id}/delete` with a full name confirmation after unpublishing/removing domains, and at `POST /account/delete` after removing owned websites and checking the password. Commerce, customer account and recovery routes are described in [the commerce guide](commerce.md). These new lifecycle flows are local-only.

## Visitor actions and the inbox

Collections can ask visitors to book, order, apply, RSVP or enquire (`src/studio/requests.ts`). When a site is published, item pages get a plain HTML form (no script) that posts to `POST /inbox/{siteId}` on the API origin (`API_ORIGIN`, default `http://127.0.0.1:8787`; in AWS the HTTP API endpoint). Form posts are answered with a `303` to the site's `thanks.html`, or a readable error page.

- Each release records which collections and items accept requests; the live release's list is what the endpoint accepts. Rollback restores it, unpublish closes it.
- That list is written at publish to object storage (`inbox/{siteId}/{releaseId}.json` in the drafts bucket); the database only stores a pointer to the live release's copy, so large catalogs stay outside the item size limit. Release cleanup removes old copies.
- Requests are validated per kind and include a hidden honeypot field. They are rate limited with the store endpoints locally; in AWS the `POST /inbox/{id}` route has its own throttle (burst 5, 2/s) so visitors can't use up the editor's. Each site accepts at most 200 requests per UTC day (429 after that).
- Editors, managers and owners read the newest 500 with `GET /sites/{id}/inbox` and set `new`/`done` with `POST /sites/{id}/inbox/{requestId}`. Viewers can't open the inbox because it holds visitors' contact details. The editor shows it under **Inbox**.
- No email is sent to visitors, so the form can't be used to relay mail.

### Getting paid

Owners list how visitors can pay in **Settings → Get paid** (also under Data → a collection → Settings): a UPI ID, an `https` payment link from any provider (Stripe, Razorpay, PayPal…), bank transfer details, and/or an in-person option (`src/studio/payments.ts`). Collections whose action is an order, booking or RSVP can turn on **Ask visitors to pay**. Forma never touches the money and charges no fee.

- Publishing records each item's unit price and the usable payment options in the release's inbox config. Badly formatted UPI IDs or links are left out, and the publish review warns about them, about missing options and about UPI with a non-rupee currency.
- A request then stores `payment {amount, currency, reference, status}`. The amount is price × quantity for orders, × guests for RSVPs, and the price for bookings. Form posts get a `303` to `GET /inbox/{siteId}/requests/{requestId}`, a page on the API origin showing the total, the reference and the options (a `upi://pay` link fills in the amount in rupees). The unguessable request ID is the capability; the page shows no visitor details and sends `Referrer-Policy: no-referrer`.
- Editors mark requests paid or unpaid with `POST /sites/{id}/inbox/{requestId}` `{payment: "paid" | "unpaid"}`; the Inbox has an **Unpaid** view. Once marked paid, the visitor's page shows "Payment received".

### Card payments through the owner's own account

The site owner can connect their own Stripe or Razorpay account under **Get paid → Card payments** (`backend/payments.ts`). Money goes to their account; Forma takes no fee and never handles card data.

- `POST /sites/{id}/payments` `{provider: "stripe", secret}` or `{provider: "razorpay", keyId, secret}` checks the key with the provider (Stripe: list Checkout Sessions, so a restricted key with **Checkout Sessions: Write** is enough; Razorpay: list payment links) and stores it encrypted with AES-256-GCM. `GET` returns only the provider, test/live mode and the last four characters. `POST /sites/{id}/payments/disconnect` removes it. These routes need the **owner** role.
- The key is encrypted with `PAYMENT_ENCRYPTION_KEY`. In AWS that comes from a generated Secrets Manager secret (`PaymentKey`, retained on stack deletion); locally a fixed development key is used.
- When connected, the payment page shows **Pay now**. `GET /inbox/{siteId}/requests/{requestId}/checkout` creates a Stripe Checkout Session or a Razorpay payment link for the exact total (reused for 20 hours, so retries don't create more), then redirects to it. It's a link, not a form, because the page's CSP blocks form redirects.
- There are no webhooks. When the visitor returns to the payment page, or the owner presses **Check payment** in the Inbox (`POST /sites/{id}/inbox/{requestId}` `{sync: true}`), the server asks the provider. A request is marked paid (`confirmedBy: "provider"`) only when the provider reports it paid in full.
- The currency comes from the collection's symbol (₹ → INR, $ → USD, € → EUR, £ → GBP, or a three-letter code). Unknown symbols fall back to the other payment options.
- Provider base URLs can be overridden with `STRIPE_API_BASE` and `RAZORPAY_API_BASE`. `tests/integration/online-payments.test.ts` runs against a fake of both: start the stack with `STRIPE_API_BASE=http://127.0.0.1:8799/stripe RAZORPAY_API_BASE=http://127.0.0.1:8799/razorpay` and run the tests with `TEST_FAKE_PROVIDERS=1`.
- Not built yet: refunds, and Stripe Connect or Razorpay partner onboarding (OAuth instead of pasted keys).
- Published pages allow `form-action 'self' https:` (plus the local API origin in local mode).

## Consistency and limits

Sites have an owner partition and an optimistic draft version. Quota creation is transactional. Draft data stays outside DynamoDB's 400 KB item limit. Gzip is checked before and during bounded decompression: 3 MB compressed / 20 MB expanded. Limits are two domain connections/site, 10 sites/account, 50 pages/site, 300 sections, 200 distinct published images, 100 items/section, and 30 MB per release. A text field can have up to 20,000 characters. These are intentionally modest initial quotas.

A save writes a unique immutable object, then conditionally advances metadata. A losing save deletes only its own object; unchanged content returns the existing version. Old draft cleanup is best effort. Publishing temporarily locks cloud saves while local edits continue. Workers have a lease, ignore superseded jobs, upload complete releases before promoting, and reconcile pointer updates after transient metadata failures. New builds are throttled to one/minute in AWS (one/second locally). Retrying an already-published draft does not rebuild it. Rollback/unpublish are not build-rate limited.

Publishing uses the editor's actual HTML renderer. It embeds uploaded raster images as hashed files, copies only allowlisted starter images, and never fetches user URLs server-side. HTTPS remote images remain remote. Private draft JSON and saved-section libraries are not published. The static origin has no auth tokens and denies arbitrary file paths. Unpublishing removes the live routing entry, including access to explicit release URLs; it cannot revoke files visitors already downloaded or cached.

## Domain consistency

Domain mutations use per-connection DynamoDB leases and transactional quotas. A hostname is claimed across workspaces only after matching its random TXT ownership record. Checks revalidate ownership before activation and require a valid HTTPS response identifying this exact website and connection. HTTP checks pin a validated public IPv4 address, reject private/metadata ranges and redirects, and have bounded response sizes/timeouts. The verification endpoint is available before site content is activated.

The edge function binds a custom hostname to one website and rejects other tenants' release paths. The same publication pointer gates default and custom addresses, including direct release paths. Asset URLs stay on the visitor's origin. A connected primary domain changes the URL presented by Forma; it does not redirect alternate addresses. Checks run on demand, not as continuous DNS monitoring.

A removed connection releases its quota only after CloudFormation confirms deletion. Use **Check connection** while removal is in progress. For a transfer, remove the prior connection before verifying it in another workspace. Local preview paths look like `http://127.0.0.1:8788/__domains/www.yourdomain.test/`; they are not public domains or real HTTPS. See [the domain guide](domains.md).

## Recovery and verification

`npm run test:integration` creates isolated test accounts and exercises the real local services. CI state is disposable; local test accounts remain in your local database. Browser edits always remain available if saving fails. Open the saved site to resolve a conflict, or choose Save as new site to keep both. **Recover previous browser draft** restores the most recent pre-open recovery copy.

Queue jobs survive a local restart. Failed jobs are stored under partition `LOCAL_DLQ`. A stale publish can be retried after its ten-minute lock expires. AWS timeouts go to SQS's DLQ; inspect that queue and the seven-day publisher log. Cleanup errors log only operation/site identifiers; orphan cleanup and release retention are best effort, not a billing hard cap. Back up `.local/data/` with services stopped before moving machines. Do not delete that directory to resolve ordinary startup errors.

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

All `/sites` routes require `Authorization: Bearer <token>`. Identity comes from the verified session/JWT, never from a request owner field. Every route is listed in `infra/api-routes.mjs`, which the AWS template is built from; locally, a route that answers successfully but isn't listed returns 500 (see [deployment](deployment.md#api-routes)).

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

- `POST /sites/{id}/payments` `{provider: "stripe", secret}` or `{provider: "razorpay", keyId, secret}` checks the key with the provider (Stripe: list Checkout Sessions, so a restricted key with **Checkout Sessions: Write** is enough to connect, and Get paid asks for **Refunds: Write** too so Inbox refunds work; Razorpay: list payment links) and stores it encrypted with AES-256-GCM. `GET` returns only the provider, test/live mode and the last four characters. `POST /sites/{id}/payments/disconnect` removes it. These routes need the **owner** role.
- The key is encrypted with `PAYMENT_ENCRYPTION_KEY`. In AWS that comes from a generated Secrets Manager secret (`PaymentKey`, retained on stack deletion); locally a fixed development key is used.
- The payment page's buttons use the site's accent, darkened when needed so their white text reads at 4.5:1.
- When connected, the payment page shows **Pay now**. `GET /inbox/{siteId}/requests/{requestId}/checkout` creates a Stripe Checkout Session or a Razorpay payment link for the exact total (reused for 20 hours, so retries don't create more), then redirects to it. It's a link, not a form, because the page's CSP blocks form redirects.
- There are no webhooks. When the visitor returns to the payment page, or the owner presses **Check payment** in the Inbox (`POST /sites/{id}/inbox/{requestId}` `{sync: true}`), the server asks the provider. A request is marked paid (`confirmedBy: "provider"`) only when the provider reports it paid in full.
- The currency comes from the collection's symbol (₹ → INR, $ → USD, € → EUR, £ → GBP, or a three-letter code). Unknown symbols fall back to the other payment options.
- Provider base URLs can be overridden with `STRIPE_API_BASE`, `RAZORPAY_API_BASE`, `STRIPE_CONNECT_BASE` (default `https://connect.stripe.com`) and `RAZORPAY_AUTH_BASE` (default `https://auth.razorpay.com`). `tests/integration/online-payments.test.ts` runs against a fake of all four: start the stack with `STRIPE_API_BASE=http://127.0.0.1:8799/stripe RAZORPAY_API_BASE=http://127.0.0.1:8799/razorpay STRIPE_CONNECT_BASE=http://127.0.0.1:8799/stripe-connect RAZORPAY_AUTH_BASE=http://127.0.0.1:8799/razorpay-auth` plus the fake platform credentials listed at the top of that file (`STRIPE_CONNECT_CLIENT_ID=ca_FormaFakePlatform`, `STRIPE_PLATFORM_SECRET=sk_test_FormaFakePlatform123`, `RAZORPAY_PARTNER_CLIENT_ID=FormaFakePartner`, `RAZORPAY_PARTNER_CLIENT_SECRET=FormaFakePartnerSecret`, `RAZORPAY_PARTNER_MODE=test`), and run the tests with `TEST_FAKE_PROVIDERS=1` (set `TEST_FAKE_PORT` and use that port in the bases if 8799 is taken). The fakes include refunds, including one whose answer is lost, and the sign-in hosts (authorize, token, refresh, deauthorize, revoke).
- **Refunds.** The owner refunds a paid request from the Inbox (**Refund**, with an in-place confirm and the amount, whole by default) with `POST /sites/{id}/inbox/{requestId}/refund` `{revision, amount?}` (amount in minor units; less than the total is a partial refund). Only the **owner** role can refund, and `GET /sites/{id}/inbox` returns `canRefund` so the button is hidden for others. Payments confirmed by the provider are refunded through it: Stripe refunds the Checkout Session's PaymentIntent (`POST /v1/refunds`, so a restricted key also needs **Refunds: Write**); Razorpay refunds the captured payment behind the payment link (`POST /v1/payments/{id}/refund`). Payments the owner marked paid are only recorded as refunded (the owner pays those back themselves); no provider is called.
- A refund is stored on the request (`payment.refund {amount, provider, id, key, by, byEmail, requestedAt, refundedAt}`) with a random key **before** the provider is called. Stripe gets the key as `Idempotency-Key`; Razorpay gets it as the refund's `receipt`, and a retry lists the payment's refunds and reuses one with that receipt. Each attempt first claims the request with a conditional write and a one-minute lease, so two clicks or tabs can't both call the provider. If the provider doesn't answer, the refund stays pending and **Finish refund** retries with the same key; if the provider refuses, the pending refund is dropped and the reason is shown. Once done, `payment.status` is `"refunded"` (the Inbox says Refunded or Partly refunded), paid/unpaid changes and payment checks no longer apply, the visitor's payment page says "Payment refunded", and the audit trail gets `request.refunded`.
- Not built yet: refunds for app records, several partial refunds of one payment (one refund per request), Stripe's Account Links onboarding for brand-new accounts (sign-in uses Stripe's OAuth for Standard accounts), and the `account.app.authorization_revoked` / `account.application.deauthorized` webhooks (an owner who removes Forma in their provider dashboard sees errors until they disconnect here).
- Published pages allow `form-action 'self' https:` (plus the local API origin in local mode).

### Connecting by signing in

When Forma has its own platform app for a provider, owners can press **Connect with Stripe** / **Connect with Razorpay** instead of pasting keys (**Use API keys instead** still shows the key form). Without the platform credentials the buttons don't show and pasted keys work as before. `GET /sites/{id}/payments` returns `signIn: {stripe, razorpay}` so the editor knows which to offer.

| Variable                                                        | Enables                                                                                   |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `STRIPE_CONNECT_CLIENT_ID` + `STRIPE_PLATFORM_SECRET`           | Stripe Connect OAuth (Standard accounts): the platform's `ca_…` client ID and `sk_…` key |
| `RAZORPAY_PARTNER_CLIENT_ID` + `RAZORPAY_PARTNER_CLIENT_SECRET` | Razorpay partner OAuth                                                                    |
| `RAZORPAY_PARTNER_MODE`                                         | `test` or `live` (default) for Razorpay's token request; production apps get live only    |

1. `POST /sites/{id}/payments/sign-in` `{provider, editor}` (owner only) stores a random 32-byte state for ten minutes, keyed by its SHA-256, with the site, the signed-in account and the editor origin to come back to (only the configured editor origin, or its `localhost` twin locally). It returns `{state, url}`; the editor keeps the state in sessionStorage and sends the owner to the provider (`https://connect.stripe.com/oauth/authorize` or `https://auth.razorpay.com/authorize`, `response_type=code`, `scope=read_write`). The `redirect_uri` is always `{API_ORIGIN}/payments/sign-in/{provider}/return`; register exactly that URL in the Stripe and Razorpay app settings.
2. The provider sends the browser to `GET /payments/sign-in/{provider}/return`. That route has no sign-in, so it only seals the code (AES-256-GCM, as for keys) into the pending state, once, and answers `303` to `/editor?site=…&open=settings&payments=finish` (or `cancelled` when the owner pressed cancel, `failed` for other provider errors, `expired` for a late or replayed return) with `Referrer-Policy: no-referrer`. Unknown states go to `/workspace`. Nothing secret is in the editor URL.
3. The editor posts the state to `POST /sites/{id}/payments/sign-in/finish` with the owner's token. A conditional delete takes the state only if it has a code, is unexpired, and belongs to this site **and** the account asking, so a state is single-use and can't be finished by anyone else (including someone who tricks an owner into opening their sign-in link). Only then is the code exchanged:
   - **Stripe:** `POST https://connect.stripe.com/oauth/token` (`grant_type=authorization_code`, with the platform key) gives `stripe_user_id` and `livemode`. Nothing secret is stored: every Stripe call for the site (checking access, Checkout Sessions, payment checks, refunds) uses the platform key with `Stripe-Account: acct_…`.
   - **Razorpay:** `POST https://auth.razorpay.com/token` (JSON, `client_id`/`client_secret`, `redirect_uri`, `mode`) gives the access and refresh tokens, expiry, `public_token` (its `rzp_test` prefix sets test mode) and `razorpay_account_id`. Both tokens are stored sealed. Calls use `Authorization: Bearer <access token>`; the token is refreshed a day before it runs out and again if Razorpay answers 401, and the stored tokens are replaced only if nobody else changed them first (a disconnect isn't undone).
   - The connection is checked like a pasted key (list Checkout Sessions / payment links); if that fails the account is released again.
4. `GET` shows `via: "oauth"` and the `account` (the editor shows the Stripe account's last four characters, or the Razorpay account ID, and test/live). **Disconnect** removes it and calls `POST https://connect.stripe.com/oauth/deauthorize` or revokes both Razorpay tokens (`POST https://auth.razorpay.com/revoke`); if the provider doesn't answer it still disconnects and returns `revoked: false`, and the editor says Forma may still be listed in the provider account. Replacing a signed-in account with another one releases the old one.

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

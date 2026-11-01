# First AWS deploy: checklist

A start-to-finish list for the first hosted environment. Each step links to the guide that explains it. Do development first, verify it, then repeat for production. Nothing here is automatic: every value is yours to create, and none of them belong in the repository.

## 0. Before touching AWS (local, already passing)

These are the checks CI and the deploy workflow run before they ever get AWS credentials. Run them on the revision you'll deploy:

- [ ] `npm ci && npm run check` (typecheck, lint, unit tests, build, backend bundle)
- [ ] `npm audit --audit-level=high` (no high or critical advisories)
- [ ] `npm run infra:build` (stack, bootstrap and domain templates generate; the stack must stay under 51,200 bytes minified for `--template-body` validation)
- [ ] `npm run local:setup && npm run test:integration` against DynamoDB Local
- [ ] With the fake providers (see the header of `tests/integration/online-payments.test.ts`, including the two fake platform webhook secrets): `TEST_FAKE_PROVIDERS=1 TEST_FAKE_PORT=8798 npm run test:integration`, and with `MAIL_FROM` and `SES_ENDPOINT` also set, `TEST_MAIL=1`
- [ ] `npm run release:readiness` and read every item that isn't `verified` ([release-readiness.json](../release-readiness.json)). The deploy script refuses to run until each one is verified with evidence. Mark an item verified only after doing what it says.

## 1. Account and roles ([deployment](deployment.md#bootstrap-a-development-environment))

- [ ] Choose the AWS account and region for development (ideally a separate account from production)
- [ ] `npm run aws:bootstrap`, review `.build/bootstrap.json`, then `-- --apply` (artifact bucket, GitHub OIDC role, CloudFormation execution role). An environment bootstrapped before the bounce handling was added needs `-- --apply` again (the execution role now manages an SES configuration set and an EventBridge rule)
- [ ] Create the GitHub `development` and `production` environments; restrict production to the release branch with reviewers
- [ ] `-- --apply --configure-github` (or set the variables from `.build/github-environment.json` by hand)

## 2. Email (SES) ([commerce](commerce.md#shopper-emails))

- [ ] In SES (same region), verify the sending domain (DKIM records) or at least the sending address
- [ ] Request production access; until then SES only delivers to verified addresses
- [ ] Set environment variable `MAIL_FROM` to the verified address (for example `orders@yourdomain`). Leave it empty and store emails stay previews, and stores don't offer customer accounts (the sign-in code is emailed)
- [ ] Nothing to set up for bounces and complaints: the stack makes the configuration set and EventBridge rule

## 3. Payments ([deployment](deployment.md#optional-connect-stripe-or-razorpay-by-signing-in), [commerce](commerce.md#checkout-through-the-owners-stripe-or-razorpay))

Owners can always paste their own keys; these steps add **Connect with Stripe/Razorpay** and platform webhooks.

- [ ] Stripe: a Connect platform (test mode for development). Variable `STRIPE_CONNECT_CLIENT_ID` (`ca_…`), secret `STRIPE_PLATFORM_SECRET`
- [ ] Razorpay: a partner app (development app for development). Variable `RAZORPAY_PARTNER_CLIENT_ID`, secret `RAZORPAY_PARTNER_CLIENT_SECRET`
- [ ] After the first deploy (the URLs need `ApiUrl`), in each app:
  - [ ] Redirect URL: `{ApiUrl}/payments/sign-in/stripe/return` and `{ApiUrl}/payments/sign-in/razorpay/return` (exactly one each)
  - [ ] Stripe Connect webhook (events on connected accounts) to `{ApiUrl}/payments/webhooks/stripe` with `checkout.session.completed` and `checkout.session.async_payment_succeeded`; put its signing secret (`whsec_…`) in secret `STRIPE_WEBHOOK_SECRET`
  - [ ] Razorpay partner webhook to `{ApiUrl}/payments/webhooks/razorpay` with `payment_link.paid`; put its secret in secret `RAZORPAY_WEBHOOK_SECRET`
  - [ ] Redeploy so the secrets reach the function
- [ ] Pasted Stripe keys need **Checkout Sessions: Write**, **Refunds: Write** and **Webhook Endpoints: Write** (Get paid says so); pasted Razorpay keys need the owner to add the webhook Get paid shows

## 4. Deploy development ([deployment](deployment.md#development--production--owned-domain))

- [ ] Repository variable `AWS_DEPLOY_ENABLED=true`
- [ ] Push to `develop`, or dispatch **Development to production (opt in)** with `development` and `DEPLOY`
- [ ] Keep the run's `deployment-…` artifact (`.build/deployment.json`: editor URL, CloudFront target, Cognito pool, `ApiUrl`)
- [ ] Finish step 3's webhook and redirect setup with that `ApiUrl`, then redeploy

## 5. Verify development (what local tests can't prove)

- [ ] Invite yourself in the Cognito pool, sign in, create and publish a site; a second user can't see it
- [ ] Store → Team: add a collaborator who isn't in the pool yet; Cognito emails them; they sign in and see the site with their role; remove them and they lose it
- [ ] Inbox: submit a form on the published site; it arrives; refund a test payment
- [ ] Store: open the store, add to cart, pay with a Stripe test card (`4242 4242 4242 4242`); the order turns paid **without** returning to the store (close the tab at Stripe's success page): that's the webhook
- [ ] Let a checkout sit 15 minutes unpaid; the stock comes back and Stripe's checkout is expired
- [ ] Refund part of the order, then the rest; Stripe shows both refunds
- [ ] Repeat the payment with Razorpay test mode
- [ ] The shopper's confirmation and refund emails arrive from the store's name (to a verified address while SES is in the sandbox)
- [ ] Customer account: sign in on `/customer?site=` with the emailed code; your orders and saved addresses show; sign out
- [ ] Bounces: trigger a sign-in code to `bounce@simulator.amazonses.com` and `complaint@simulator.amazonses.com` (SES's mailbox simulator); the outbox marks them bounced and complained, and the next email to either is "not sent"
- [ ] Get paid: connect by signing in with Stripe and Razorpay, then disconnect
- [ ] Start a checkout, disconnect, then pay it anyway (Inbox payment page): the request still turns paid from the webhook
- [ ] Migration: Store → Import & migrate a real Shopify products export and customers export; publish; `https://<site>/products/<handle>` and `/collections/<type>` forward to the store, and a page's clean address (`/about`) loads (the site router changed, so this proves the CloudFront function update)
- [ ] Search: on the published site, view source for the canonical link and JSON-LD; `/sitemap.xml` and `/robots.txt` load on the primary domain; Google's Rich Results Test reads a product page's Product data
- [ ] Insights: visit a few pages from two devices and a `?utm_source=…&utm_campaign=…` link, buy through it; `/insights` shows the visitors, campaign and the sale under its channel
- [ ] Tracking: with a GA4 ID and Pixel set, the consent banner shows; after Accept, GA's Realtime and Meta's Events Manager see the visit (proves the CSP update)
- [ ] Marketing: send an A/B campaign with an image and button to two verified addresses; both arrive designed, with working unsubscribe links; remind an expired checkout; turn on automatic reminders and leave a checkout unpaid past the delay
- [ ] Store tracking: with GA4 set, buy in the store; GA's Realtime shows `purchase` with the order total
- [ ] Product page: sell the last item; the published product page says Sold out without republishing
- [ ] Throttles: hammering a public route returns 429; CORS from the editor origin works; the published site's Shop link opens `/store`
- [ ] Publish failures land in the DLQ and retry; restoring a release changes only the route
- [ ] Record what you checked in `release-readiness.json` (`cloud`, `payments`, `notifications`) with evidence

## 6. Domain and production

- [ ] Connect the editor's own hostname ([domains](domains.md#the-forma-platforms-own-domain)): `EDITOR_DOMAIN` + a us-east-1 `EDITOR_CERTIFICATE_ARN`
- [ ] Bootstrap production (its own account, stack `forma-production`), live-mode Stripe and Razorpay apps, live webhook secrets, its own `MAIL_FROM`
- [ ] Dispatch the workflow on the release branch with `production` and `DEPLOY`; repeat step 5 with small real payments you refund

## Still not available on AWS

Nothing in the store is closed on AWS any more, except the local sandbox payment (it never takes money). Everything above still has to be verified on a real deployment.

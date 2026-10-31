# First AWS deploy: checklist

A start-to-finish list for the first hosted environment. Each step links to the guide that explains it. Do development first, verify it, then repeat for production. Nothing here is automatic: every value is yours to create, and none of them belong in the repository.

## 0. Before touching AWS (local, already passing)

These are the checks CI and the deploy workflow run before they ever get AWS credentials. Run them on the revision you'll deploy:

- [ ] `npm ci && npm run check` (typecheck, lint, unit tests, build, backend bundle)
- [ ] `npm audit --audit-level=high` (no high or critical advisories)
- [ ] `npm run infra:build` (stack, bootstrap and domain templates generate; the stack must stay under 51,200 bytes minified for `--template-body` validation)
- [ ] `npm run local:setup && npm run test:integration` against DynamoDB Local
- [ ] With the fake providers (see the header of `tests/integration/online-payments.test.ts`): `TEST_FAKE_PROVIDERS=1 npm run test:integration`, and with `MAIL_FROM` and `SES_ENDPOINT` also set, `TEST_MAIL=1`
- [ ] `npm run release:readiness` and read every item that isn't `verified` ([release-readiness.json](../release-readiness.json)). The deploy script refuses to run until each one is verified with evidence. Mark an item verified only after doing what it says.

## 1. Account and roles ([deployment](deployment.md#bootstrap-a-development-environment))

- [ ] Choose the AWS account and region for development (ideally a separate account from production)
- [ ] `npm run aws:bootstrap`, review `.build/bootstrap.json`, then `-- --apply` (artifact bucket, GitHub OIDC role, CloudFormation execution role)
- [ ] Create the GitHub `development` and `production` environments; restrict production to the release branch with reviewers
- [ ] `-- --apply --configure-github` (or set the variables from `.build/github-environment.json` by hand)

## 2. Email (SES) ([commerce](commerce.md#shopper-emails))

- [ ] In SES (same region), verify the sending domain (DKIM records) or at least the sending address
- [ ] Request production access; until then SES only delivers to verified addresses
- [ ] Set environment variable `MAIL_FROM` to the verified address (for example `orders@yourdomain`). Leave it empty and store emails stay previews
- [ ] Later: a configuration set with bounce and complaint handling (not yet built)

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
- [ ] Inbox: submit a form on the published site; it arrives; refund a test payment
- [ ] Store: open the store, add to cart, pay with a Stripe test card (`4242 4242 4242 4242`); the order turns paid **without** returning to the store (close the tab at Stripe's success page): that's the webhook
- [ ] Let a checkout sit 15 minutes unpaid; the stock comes back and Stripe's checkout is expired
- [ ] Refund part of the order, then the rest; Stripe shows both refunds
- [ ] Repeat the payment with Razorpay test mode
- [ ] The shopper's confirmation and refund emails arrive from the store's name (to a verified address while SES is in the sandbox)
- [ ] Get paid: connect by signing in with Stripe and Razorpay, then disconnect
- [ ] Throttles: hammering a public route returns 429; CORS from the editor origin works; the published site's Shop link opens `/store`
- [ ] Publish failures land in the DLQ and retry; restoring a release changes only the route
- [ ] Record what you checked in `release-readiness.json` (`cloud`, `payments`, `notifications`) with evidence

## 6. Domain and production

- [ ] Connect the editor's own hostname ([domains](domains.md#the-forma-platforms-own-domain)): `EDITOR_DOMAIN` + a us-east-1 `EDITOR_CERTIFICATE_ARN`
- [ ] Bootstrap production (its own account, stack `forma-production`), live-mode Stripe and Razorpay apps, live webhook secrets, its own `MAIL_FROM`
- [ ] Dispatch the workflow on the release branch with `production` and `DEPLOY`; repeat step 5 with small real payments you refund

## Still not available on AWS

- Shopper accounts (`/customer`): need a sign-in service for shoppers
- Inviting collaborators: needs a Cognito user lookup and invitation flow
- Email deliverability handling (bounces, complaints, suppression)

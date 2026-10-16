# Forma — Website Studio

A branded website-building product with public pages, template previews, an account dashboard, a visual editor, a local DynamoDB backend, account workspaces, versioned drafts, static publishing, rollback, and owned-domain onboarding. Built with React, TypeScript, Vite, and Zustand.

## Run

```sh
nvm use
npm ci
npm run local:setup
npm run dev:local
```

Requires Node.js 22.12+ and Java 17+. Open http://127.0.0.1:5178 in Chrome, choose **Get started** to create a local account, then **Create a website**. In the editor, choose **Publish → Publish changes**. The live preview opens on port 8788, on a separate origin from the editor. No AWS account, credentials, Docker, email service, or paid resources are needed.

`local:setup` downloads AWS's official DynamoDB Local distribution and verifies its published SHA-256 checksum. Everything persists in ignored `.local/` files. Stop the services with Ctrl+C and run `npm run dev:local` again to resume. `npm run dev` runs the public pages and browser editor without backend connectivity. The editor is at `/editor`, and saved websites are at `/workspace`.

See [local development and API](docs/backend.md), [CI, AWS deployment, and usage costs](docs/deployment.md), and [owned domains from local preview to HTTPS](docs/domains.md).

## Product pages

- `/`: Forma homepage with shared logo, typography, palette, and navigation.
- `/features`, `/templates`, `/templates/:id`, `/pricing`, `/about`: product, searchable starting points, working full-site previews, transparent hosting options, and brand story.
- `/help`, `/help/:id`, `/privacy`: practical guides, search, FAQs, and storage/privacy details.
- `/login`, `/signup`, `/workspace`, `/new`, `/editor`, `/domains?site=…`: account entry, saved websites with search/filter/sort, template-based creation, and editing. Dashboard links load the selected saved version and preserve a browser recovery copy.

`npm run build` creates 13 static public pages with individual metadata, four template preview entrypoints, six workspace entrypoints, and a branded 404. Public pages are rendered at build time and need no account/API requests. The editor and authentication libraries load only when needed. Set optional `PUBLIC_SITE_URL=https://your-domain.example` at build time to generate canonical URLs and a sitemap using your real deployment URL. Private workspace routes are marked `noindex`. CloudFront directory rewrites support direct links and refreshes; unknown paths return the branded 404.

## Editor

- Start with Botanical (store), Forma Studio (portfolio), Common Ground (business), Sunday Table (restaurant), or a blank canvas.
- Add and arrange 14 section types. Choose where to insert a section in the library, drag the visual page outline, or use the up/down controls. Duplicate, hide, and remove sections with undo/redo.
- Hover a section to see its blue outline and name tag; the text under the pointer gets a dotted outline. Click a section to open its settings. Click text to find its field in the inspector; double-click it, press Enter while focused, or choose Edit on canvas to start typing. Done or clicking outside saves one undoable change; Cancel or Escape discards it. Hover and selection outlines hide while typing. Canvas text has no surrounding edit box; double-clicking selects the clicked word, and the settings field shows the live draft.
- Browse pages and their sections in one navigator. Search page names, section names, and section content across the website. Page actions include settings and SEO, duplication with independent content and a unique URL, reordering, and deletion. The home page stays first and cannot be deleted. Headers and footers are shared across pages; internal section links follow page URL changes.
- Save a section from its actions menu or inspector, then open Saved sections to insert it on another page. Each insertion is an independent copy. Saved sections are included in browser storage and project backups, and library changes support undo/redo.
- Open Site styles to change global colors, typography, and corner radius. Settings open when needed; closing them gives the canvas more room.
- Press ⌘K / Ctrl K to find pages, sections across the entire project, and editing actions. Action menus support arrow keys, Home/End, and Escape.
- Review the website before export: actionable checks identify missing page descriptions, image descriptions, unresolved internal links, and unconnected forms. Each issue opens the relevant page or section.
- Upload JPG, PNG, WebP, or GIF images (up to 3 MB each). Static uploads are resized to a maximum of 1600 px and stored locally.
- Preview desktop, tablet, and mobile layouts. Navigation and accordion sections work in preview.
- Download an HTML/CSS ZIP, including local images and an editable project backup. Import the backup through Settings.

## Saving and integrations

Edits persist in this browser under `forma-studio-project-v1`. Storage failures are shown in the editor; download a project backup before closing if saving fails. Undo/redo retains up to 50 edits in the current session. The original builder's `draft-storage` data is left intact.

Workspace drafts also save to the backend after 10 seconds of inactivity. Unchanged saves and already-published draft versions are deduplicated. Conflicts pause syncing and keep browser edits intact. Opening another site keeps a browser recovery copy. Each local account owns its own sites; sessions survive a service restart and are revoked on sign-out.

Publish creates a complete HTML/CSS/image release before promoting its live route. Failed builds preserve the previous release. Restore a retained release or unpublish from Workspace. Up to three releases are retained during successful publishing. Published sites contain no editable project backups. Rollback affects the live website only.

Website-editor contact/newsletter sections use the endpoint you configure, and their product cards link to the URLs you provide. The separate local commerce storefront has a native catalog, cart, checkout, orders, inventory, customer accounts, contact inbox, and newsletter capture. Payments are an explicit local simulator; no money is collected. It is not a live payment processor, domain registrar, or multiplayer editor.

## Local commerce and accounts

Open **Workspace → Store management**, select a website, add products, then enable the storefront in **Markets**. **Open storefront** opens `/store?site=…`. The commerce pages share the existing light theme.

- Products: variants, stock, SKUs, collections, translations, per-market prices, and CSV import/export. Imports create new products; they do not overwrite matching names.
- Cart and checkout: browser-persistent cart capabilities, backend-calculated totals, manual shipping/tax rules, expiring/limited discounts, and an explicit approved/declined payment simulator. Stock, payment, order, customer and discount updates commit in a DynamoDB transaction.
- Orders: pending, paid, fulfilled, cancelled and refunded states, tracking references, whole-order return requests and approvals, full sandbox refunds with optional restocking, CSV exports and local email previews.
- Customers: private order history and saved addresses at `/customer?site=…`. Local accounts do not verify email; this flow must not be exposed as production identity.
- Content and forms: a plain-text journal, contact submissions, consented newsletter records, unsubscribe links and campaign-recipient previews. Campaigns do not send email.
- Teams: owner, manager, editor and viewer permissions apply to commerce and existing website draft/publish/domain APIs. Local collaborators must already have an account.
- Integrations: authenticated local event feeds with HMAC signatures. This is not outbound webhook delivery, POS, or marketplace synchronization.
- Account settings: password changes, session revocation, single-use recovery links and guarded local deletion. Recovery email previews are private files in `.local/data/mail/`. Site deletion requires unpublishing, removing domains and typing its full confirmation phrase.

Run `npm run local:start`, `local:status`, `local:restart` or `local:stop` to manage services in the background without depending on an open terminal. Data is preserved across restarts. See [commerce behavior and outstanding release work](docs/commerce.md).

Deployment is blocked by `release-readiness.json` until every requirement has verification evidence. `npm run release:readiness` reports the outstanding requirements without contacting AWS. Local tests, builds and static site exports remain available.

## Owned domains and deployment

Open **Your websites → Domains & publish** to connect a hostname, copy or download DNS records, verify ownership, prepare HTTPS, select a primary address, and publish. Root domains and subdomains are supported, with two connections per website. The local DNS simulator walks through the same stages without real DNS or AWS resources. Disconnect pauses one hostname; unpublish takes every address offline; remove tears down that domain's HTTPS resources while keeping website data.

`npm run infra:build` generates the application, CI bootstrap, and domain templates locally. `npm run aws:bootstrap` prepares the GitHub OIDC roles and artifact bucket; `npm run aws:editor-domain` prepares the platform's own HTTPS certificate; `npm run dns:configure` plans DNS changes for an existing Route 53 or Cloudflare zone. Their explicit apply flags and configured accounts are required to change cloud resources. See the linked deployment and domain guides for the complete sequence. CI checks every revision before opt-in development deployment or production promotion.

## Validation

```sh
npm run check
npm run test:integration  # while the local backend is running
npm audit --audit-level=high
npm run lint:current
```

Tests cover editor behavior, workspace autosaving/conflicts/recovery, server validation, domain setup, ownership/tenant isolation, edge routing, and the complete authenticated publish/rollback/unpublish flow against real DynamoDB Local. GitHub Actions repeats these checks in a fresh local environment. AWS deployment is separately opt-in and disabled by default. Existing legacy builder files remain in `src/pages/builder`; the product pages run from `src/brand` and the editor from `src/studio`.

## Assets

Starter photography comes from Unsplash and is bundled in `public/images`. The editor font is DM Sans, bundled with its OFL license in `public/fonts`. Website exports use system fonts and have no required external font service.

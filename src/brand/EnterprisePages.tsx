import { Icon } from "../studio/Icon";
import { Arrow } from "./Brand";
import { brand, enterpriseFaqs, migrationFaqs } from "./content";

/** The sales address, set at build time (VITE_SALES_EMAIL); without it pages offer sign-up only. */
const salesEmail =
  (import.meta.env.VITE_SALES_EMAIL as string | undefined) || "";
const talk = (subject: string) =>
  `mailto:${salesEmail}?subject=${encodeURIComponent(subject)}`;

function Faq({ items }: { items: readonly (readonly string[])[] }) {
  return (
    <div className="pub-faq">
      {items.map(([question, answer]) => (
        <details key={question}>
          <summary>
            {question}
            <Icon name="plus" size={18} />
          </summary>
          <p>{answer}</p>
        </details>
      ))}
    </div>
  );
}
function Checks({ items }: { items: string[] }) {
  return (
    <ul className="pub-checks">
      {items.map((item) => (
        <li key={item}>
          <Icon name="check" size={15} />
          {item}
        </li>
      ))}
    </ul>
  );
}
function Contact({ subject, children }: { subject: string; children: string }) {
  return salesEmail ? (
    <a className="pub-btn pub-btn-primary" href={talk(subject)}>
      {children} <Arrow />
    </a>
  ) : (
    <a className="pub-btn pub-btn-primary" href="/signup">
      Start a workspace <Arrow />
    </a>
  );
}

/** What a team can build: each one a website, a store and an app working together. */
const BUILDS = [
  {
    icon: "store",
    title: "Commerce, your way",
    text: "A catalogue with variants and stock, markets with their own currency, tax and shipping, discounts, refunds, returns and customer accounts.",
  },
  {
    icon: "layers",
    title: "Business apps",
    text: "Tables, forms, workflow steps, dashboards and roles for the work behind the website: bookings, service requests, quotes, rewards or anything you describe.",
  },
  {
    icon: "users",
    title: "Portals for people",
    text: "Owners, staff and customers each get their own view: an owner app that installs on a phone, staff with the access they need, shoppers with their orders.",
  },
  {
    icon: "plug",
    title: "Connected to your stack",
    text: "Signed event feeds for orders and products, CSV exports of every record, and Stripe, Razorpay, UPI or bank transfer for payments.",
  },
];
const EXAMPLES = [
  [
    "Franchise ordering",
    "Each outlet orders from a shared catalogue with its own prices; head office follows every order from payment to delivery.",
  ],
  [
    "Service bookings",
    "Customers book a slot and pay online; staff see their day, move each job through its steps and close it with a note.",
  ],
  [
    "B2B quotes",
    "Buyers send a request with their details; your team prices it, follows it up and turns it into an order.",
  ],
  [
    "Membership and rewards",
    "Members join on the website, collect points with every purchase and redeem them, with totals the owner can see at a glance.",
  ],
] as const;

export function Enterprise() {
  return (
    <>
      <section className="pub-intro">
        <div className="pub-container">
          <span className="pub-eyebrow">
            <i /> {brand.name} for teams and enterprises
          </span>
          <h1>
            Your requirements.
            <br />
            <span className="pub-gradient-text">Built, not worked around.</span>
          </h1>
          <p className="pub-intro-lead">
            Websites, stores and the business apps behind them on one platform,
            shaped to how your organisation works. Bring your store from Shopify
            or Wix, deploy on your own cloud, and grow without a patchwork of
            plugins.
          </p>
          <div className="pub-hero-actions">
            <Contact subject={`${brand.name} for our organisation`}>
              Talk to our team
            </Contact>
            <a className="pub-btn pub-btn-ghost" href="/migrate">
              Move from Shopify or Wix
            </a>
          </div>
        </div>
      </section>
      <section className="pub-container pub-capabilities pub-enterprise-builds">
        {BUILDS.map((b) => (
          <article className="pub-capability" key={b.title} data-reveal>
            <div className="pub-capability-icon">
              <Icon name={b.icon} size={19} />
            </div>
            <h2>{b.title}</h2>
            <p>{b.text}</p>
          </article>
        ))}
      </section>
      <section className="pub-section">
        <div className="pub-container">
          <div className="pub-section-head" data-reveal>
            <div>
              <span className="pub-label">Any requirement</span>
              <h2>If your business runs on it, build it here.</h2>
              <p>
                A few of the shapes teams build. Each is a website, a store and
                an app sharing the same records, not three tools stitched
                together.
              </p>
            </div>
          </div>
          <div className="pub-usecases">
            {EXAMPLES.map(([title, text], i) => (
              <article className="pub-usecase" key={title} data-reveal>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="pub-section">
        <div className="pub-container pub-feature" data-reveal>
          <div className="pub-feature-copy">
            <span className="pub-label">Own it</span>
            <h2>Your cloud. Your data. Your rules.</h2>
            <p>
              {brand.name} deploys into your own AWS account, so customer data,
              orders and files live where your security team expects them.
            </p>
            <Checks
              items={[
                "Runs on AWS Lambda, DynamoDB, S3, CloudFront and Cognito in your account",
                "Owner, manager, editor and viewer roles, with an activity log",
                "Signed webhooks and event feeds; every record exports to CSV",
                "HTTPS on your own domains, with releases you can roll back",
              ]}
            />
            <a className="pub-link" href="/privacy">
              Where your data lives <Arrow />
            </a>
          </div>
          <div className="pub-demo pub-stack" aria-hidden="true">
            {[
              ["globe", "Your domain", "shop.yourcompany.com"],
              ["layers", "Website, store and apps", "Published releases"],
              ["lock", "Sign-in and roles", "Cognito in your account"],
              ["receipt", "Records and orders", "DynamoDB in your account"],
            ].map(([icon, title, note]) => (
              <div key={title}>
                <Icon name={icon} size={17} />
                <span>
                  <b>{title}</b>
                  <small>{note}</small>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="pub-section">
        <div className="pub-container pub-split" data-reveal>
          <div className="pub-split-copy">
            <span className="pub-label">How we work</span>
            <h2>From brief to launch, with you.</h2>
            <p>
              Tell us what the business needs. We shape it with you on the
              platform, move what you already have, and hand over something your
              team can run.
            </p>
          </div>
          <div className="pub-steps">
            {[
              [
                "01",
                "Map the requirement",
                "Your processes, roles, data and integrations, written down and agreed.",
              ],
              [
                "02",
                "Prototype on the platform",
                "A working version in days, not a slide deck: pages, store and app you can click through.",
              ],
              [
                "03",
                "Migrate",
                "Products, customers and old links from Shopify, Wix or spreadsheets, checked before switching.",
              ],
              [
                "04",
                "Launch and grow",
                "Your domain, payments and team access, then new requirements as they come.",
              ],
            ].map(([n, title, text]) => (
              <article className="pub-step" key={n}>
                <span>{n}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="pub-section">
        <div className="pub-container pub-split">
          <div className="pub-split-copy">
            <span className="pub-label">FAQ</span>
            <h2>Questions teams ask.</h2>
          </div>
          <Faq items={enterpriseFaqs} />
        </div>
      </section>
      <EnterpriseCTA />
    </>
  );
}

/** What comes across from each platform, honestly. */
const MOVES: [string, string, string][] = [
  ["Products, variants and prices", "Yes", "Yes, with option surcharges"],
  ["Stock levels", "Yes", "Yes"],
  ["Product images", "Yes (linked)", "Yes (linked)"],
  ["Collections and product types", "Yes", "Yes"],
  ["Customers", "Yes, with order count and spend", "Yes, from contacts"],
  ["Email marketing consent", "Yes", "Yes"],
  [
    "Old product and collection links",
    "Redirect automatically",
    "Redirect automatically",
  ],
  [
    "Other URL redirects",
    "Import Shopify’s redirect CSV",
    "Add them in Settings",
  ],
  [
    "Pages and blog posts",
    "Rebuilt from a template",
    "Rebuilt from a template",
  ],
  ["Apps and plugins", "Rebuilt as Forma apps", "Rebuilt as Forma apps"],
  ["Past orders", "Kept in your Shopify export", "Kept in your Wix export"],
  [
    "Passwords",
    "Not needed: email code sign-in",
    "Not needed: email code sign-in",
  ],
];

export function Migrate() {
  return (
    <>
      <section className="pub-intro">
        <div className="pub-container">
          <span className="pub-eyebrow">
            <i /> Migration
          </span>
          <h1>
            Leave Shopify or Wix.
            <br />
            <span className="pub-gradient-text">
              Keep everything that matters.
            </span>
          </h1>
          <p className="pub-intro-lead">
            Drop in the exports you already have. Products, customers and old
            links come across, nothing is saved until you’ve seen it, and your
            search rankings keep pointing to the right pages.
          </p>
          <div className="pub-hero-actions">
            <a className="pub-btn pub-btn-primary" href="/signup">
              Start your move <Arrow />
            </a>
            {salesEmail && (
              <a
                className="pub-btn pub-btn-ghost"
                href={talk("Help moving our store")}
              >
                Have us move it for you
              </a>
            )}
          </div>
        </div>
      </section>
      <section className="pub-container pub-capabilities">
        {[
          [
            "upload",
            "Exports as they are",
            "Shopify and Wix CSVs are recognised by their columns. No editing, no reformatting.",
          ],
          [
            "eye",
            "See it first",
            "Every file is previewed in your browser, with a note of anything that doesn’t come across.",
          ],
          [
            "link",
            "Links that still work",
            "Old product, collection and page addresses forward to their new home.",
          ],
          [
            "redo",
            "Safe to repeat",
            "Run the same file again and nothing is duplicated. Pick up where you left off.",
          ],
        ].map(([icon, title, text]) => (
          <article className="pub-capability" key={title} data-reveal>
            <div className="pub-capability-icon">
              <Icon name={icon} size={19} />
            </div>
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </section>
      <section className="pub-section">
        <div className="pub-container">
          <div className="pub-section-head" data-reveal>
            <div>
              <span className="pub-label">What moves</span>
              <h2>A clear account of what comes with you.</h2>
              <p>No surprises after the switch.</p>
            </div>
          </div>
          <div className="pub-compare-wrap" data-reveal>
            <table className="pub-compare">
              <thead>
                <tr>
                  <th scope="col">From your old store</th>
                  <th scope="col">Shopify</th>
                  <th scope="col">Wix</th>
                </tr>
              </thead>
              <tbody>
                {MOVES.map(([what, shopify, wix]) => (
                  <tr key={what}>
                    <th scope="row">{what}</th>
                    <td>{shopify}</td>
                    <td>{wix}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      <section className="pub-section">
        <div className="pub-container pub-split" data-reveal>
          <div className="pub-split-copy">
            <span className="pub-label">Four steps</span>
            <h2>Switch over an afternoon, not a quarter.</h2>
            <p>
              Your old store keeps selling until you point your domain at{" "}
              {brand.name}.
            </p>
            <a className="pub-link" href="/help/migrate">
              Read the migration guide <Arrow />
            </a>
          </div>
          <div className="pub-steps">
            {[
              [
                "01",
                "Pick a template",
                "Start from a store template and make it yours, or keep a blank canvas.",
              ],
              [
                "02",
                "Import products and customers",
                "In your store, open Import & migrate and drop in the Shopify or Wix exports.",
              ],
              [
                "03",
                "Keep your links",
                "Products redirect by themselves. Import Shopify’s redirect list, or add other pages in Settings.",
              ],
              [
                "04",
                "Point your domain",
                "Connect your domain, publish, and switch when you’re ready.",
              ],
            ].map(([n, title, text]) => (
              <article className="pub-step" key={n}>
                <span>{n}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="pub-section">
        <div className="pub-container pub-split">
          <div className="pub-split-copy">
            <span className="pub-label">FAQ</span>
            <h2>Before you move.</h2>
          </div>
          <Faq items={migrationFaqs} />
        </div>
      </section>
      <EnterpriseCTA />
    </>
  );
}

function EnterpriseCTA() {
  return (
    <div className="pub-container">
      <section className="pub-cta" data-reveal>
        <h2>
          Tell us what you need.
          <br />
          <span className="pub-gradient-text">We’ll show you it working.</span>
        </h2>
        <p>Bring a requirement, a store to move, or both.</p>
        <div className="pub-hero-actions">
          <Contact subject={`A requirement for ${brand.name}`}>
            Talk to our team
          </Contact>
          <a className="pub-btn pub-btn-ghost" href="/templates">
            Explore templates
          </a>
        </div>
      </section>
    </div>
  );
}

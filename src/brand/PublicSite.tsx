import { useState, type CSSProperties } from "react";
import { Icon } from "../studio/Icon";
import { MotionTabs } from "./MotionTabs";
import { Arrow, Brand } from "./Brand";
import { Shell, FinalCTA } from "./Shell";
import { TemplateArt } from "./TemplateArt";
import { collections, faqs, guides } from "./content";

function TemplateCard({ item }: { item: (typeof collections)[number] }) {
  return (
    <article className="brand-template-card" data-reveal>
      <a
        className="brand-template-visual"
        href={`/templates/${item.id}`}
        aria-label={`Preview ${item.name}`}
      >
        <TemplateArt template={item.id} />
        <span className="template-preview-label">
          Explore template <Arrow diagonal />
        </span>
      </a>
      <div className="brand-template-caption">
        <div>
          <h3>
            <a href={`/templates/${item.id}`}>{item.name}</a>
          </h3>
          <p>
            {item.category} <span>·</span> {item.subtitle}
          </p>
        </div>
        <div className="template-palette" aria-hidden="true">
          {item.palette.map((color) => (
            <i key={color} style={{ backgroundColor: color }} />
          ))}
        </div>
      </div>
    </article>
  );
}
function Home() {
  const [example, setExample] = useState<"studio" | "folio" | "botanical">(
    "botanical",
  );
  return (
    <>
      <section className="saas-hero editorial-hero">
        <div className="hero-intro">
          <div className="saas-hero-copy">
            <span className="saas-eyebrow">
              <span /> THE INDEPENDENT WEBSITE BUILDER
            </span>
            <h1>
              Big ideas.
              <br />
              <span>
                Meet your <em>website.</em>
              </span>
            </h1>
          </div>
          <div className="hero-intro-actions">
            <p>
              Bring your business, portfolio, or next big idea to life. Design
              it your way. Publish on your own domain.
            </p>
            <div className="saas-hero-actions">
              <a className="brand-button" href="/new">
                Start building <Arrow />
              </a>
              <a className="brand-text-link" href="/templates">
                Explore templates <Arrow diagonal />
              </a>
            </div>
            <div className="saas-hero-notes">
              <span>
                <Icon name="check" size={14} /> Free to start
              </span>
              <span>
                <Icon name="check" size={14} /> No code required
              </span>
            </div>
          </div>
        </div>
        <div className="forma-showcase">
          <div className="saas-preview-topline">
            <span>
              <span className="preview-status-dot" /> MAKE IT YOURS
            </span>
            <MotionTabs
              label="Preview a website style"
              value={example}
              onChange={(id) => setExample(id as typeof example)}
              options={[
                { id: "studio", label: "Business" },
                { id: "folio", label: "Portfolio" },
                { id: "botanical", label: "Store" },
              ]}
            />
          </div>
          <div className="saas-preview-wrap" data-tilt>
            <div className="saas-product-preview">
              <div className="saas-product-bar">
                <span className="preview-window-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <strong>
                  {
                    collections.find((template) => template.id === example)
                      ?.name
                  }
                </strong>
                <span className="saas-demo-label">Website preview</span>
                <a href={`/templates/${example}`}>
                  Explore this design <Arrow diagonal />
                </a>
              </div>
              <div className="saas-preview-scene" key={example}>
                <TemplateArt template={example} eager />
              </div>
            </div>
          </div>
          <div className="saas-preview-caption">
            <span>A starting point. Make it yours.</span>
            <a href={`/new?template=${example}`}>
              Use this template <Arrow />
            </a>
          </div>
        </div>
      </section>
      <section className="saas-capabilities" aria-label="Platform capabilities">
        {[
          ["edit", "Visual editing", "Make changes directly on your page."],
          [
            "globe",
            "Your own domain",
            "One address. A complete brand experience.",
          ],
          ["layers", "Versioned publishing", "Launch updates with a way back."],
          [
            "download",
            "Portable by design",
            "Export your files. Keep your options open.",
          ],
        ].map(([icon, title, text]) => (
          <article key={title} data-reveal>
            <div className="saas-capability-label">
              <Icon name={icon} size={20} />
            </div>
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </section>
      <section className="brand-section saas-template-section">
        <div className="brand-section-heading" data-reveal>
          <div>
            <span className="brand-kicker">THE TEMPLATE COLLECTION</span>
            <h2>
              A starting point.
              <br />
              Your point of view.
            </h2>
            <p>Choose a look you love. Make every detail your own.</p>
          </div>
          <a className="brand-button brand-button-outline" href="/templates">
            All templates <Arrow />
          </a>
        </div>
        <div className="brand-template-grid home-template-grid">
          {[collections[1], collections[2], collections[3]].map((item) => (
            <TemplateCard item={item} key={item.id} />
          ))}
        </div>
      </section>
      <section className="saas-workflow" data-reveal>
        <div className="saas-workflow-heading">
          <span className="brand-kicker">ONE CONNECTED WORKFLOW</span>
          <h2>
            From first idea
            <br />
            to your own address.
          </h2>
          <p>
            Your pages, design, and publishing work together. Focus on the
            website you want to build.
          </p>
          <a className="brand-text-link" href="/help/start">
            See how to get started <Arrow />
          </a>
        </div>
        <div className="saas-workflow-steps">
          {[
            [
              "01",
              "Start with a solid foundation",
              "Choose a template or a blank canvas. Set your typography, colors, and shared navigation.",
            ],
            [
              "02",
              "Make every page your own",
              "Edit on the canvas, arrange sections, and preview every screen size before publishing.",
            ],
            [
              "03",
              "Publish on your terms",
              "Connect your domain, publish your saved draft, and restore a previous release when you need to.",
            ],
          ].map(([number, title, text]) => (
            <article key={number}>
              <span>{number}</span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="brand-section brand-faq">
        <div>
          <span className="brand-kicker">BEFORE YOU START</span>
          <h2>A few useful answers.</h2>
          <a href="/help" className="brand-text-link">
            Visit the help center <Arrow />
          </a>
        </div>
        <div>
          {faqs.slice(0, 4).map(([question, answer]) => (
            <details key={question} data-reveal>
              <summary>
                {question}
                <Icon name="plus" size={18} />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
      <FinalCTA />
    </>
  );
}

function Templates() {
  const [category, setCategory] = useState("All templates");
  const [search, setSearch] = useState("");
  const shown = collections.filter(
    (item) =>
      (category === "All templates" || item.category === category) &&
      `${item.name} ${item.category} ${item.subtitle}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <section className="brand-page-intro">
        <span className="brand-kicker">THE TEMPLATE COLLECTION</span>
        <h1>
          A head start.
          <br />
          <span>Your own style.</span>
        </h1>
        <p>
          Four distinct starting points, ready for your ideas. Choose a design
          and make every part your own.
        </p>
      </section>
      <section className="brand-section brand-collection">
        <div className="brand-collection-toolbar">
          <div className="brand-filter-tabs" aria-label="Template categories">
            {["All templates", ...collections.map((item) => item.category)].map(
              (item) => (
                <button
                  aria-pressed={category === item}
                  key={item}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ),
            )}
          </div>
          <label className="brand-search">
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <circle cx="10" cy="10" r="6" />
              <path d="m15 15 5 5" />
            </svg>
            <input
              aria-label="Search templates"
              placeholder="Find your starting point"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <div className="brand-results-count" aria-live="polite">
          {shown.length} template{shown.length === 1 ? "" : "s"}
        </div>
        <div className="brand-template-grid">
          {shown.map((item) => (
            <TemplateCard item={item} key={item.id} />
          ))}
        </div>
        {!shown.length && (
          <div className="brand-empty">
            <h2>Let's try another direction.</h2>
            <p>No templates match that search.</p>
            <button
              className="brand-button"
              onClick={() => {
                setSearch("");
                setCategory("All templates");
              }}
            >
              See all templates <Arrow />
            </button>
          </div>
        )}
        <div className="brand-blank-banner">
          <span className="blank-banner-plus">+</span>
          <div>
            <h2>Or start with nothing but an idea.</h2>
            <p>A blank canvas. A full set of tools. All yours.</p>
          </div>
          <a
            className="brand-button brand-button-outline"
            href="/new?template=blank"
          >
            Start from scratch <Arrow />
          </a>
        </div>
      </section>
      <FinalCTA />
    </>
  );
}
function Features() {
  const [accent, setAccent] = useState("#294b3b");
  return (
    <>
      <section className="brand-page-intro">
        <span className="brand-kicker">MEET YOUR WEBSITE BUILDER</span>
        <h1>
          Everything flows.
          <br />
          <span>From idea to live.</span>
        </h1>
        <p>
          A visual canvas, site-wide styles, and a clear path to publishing.
          Everything stays connected as your website grows.
        </p>
        <a className="brand-button" href="/new">
          Try the builder <Arrow />
        </a>
      </section>
      <div className="feature-showcase-grid">
        <section className="brand-feature-block">
          <div className="brand-feature-number">01 / MAKE IT YOURS</div>
          <div className="brand-feature-content">
            <div>
              <h2>
                Your style.
                <br />
                Everywhere.
              </h2>
              <p>
                Choose a palette, set the typography, and give the details a
                little attention. Global styles keep your website feeling like
                one whole idea.
              </p>
              <div
                className="feature-color-options"
                aria-label="Try a color palette"
              >
                {[
                  ["#294b3b", "Forest"],
                  ["#843d2b", "Terracotta"],
                  ["#25374c", "Ink"],
                ].map(([color, label]) => (
                  <button
                    key={color}
                    aria-label={`Try ${label} palette`}
                    aria-pressed={accent === color}
                    style={{ backgroundColor: color }}
                    onClick={() => setAccent(color)}
                  />
                ))}
                <span>Try a different shade.</span>
              </div>
            </div>
            <div
              className="feature-template-demo"
              style={{ "--demo-accent": accent } as CSSProperties}
            >
              <TemplateArt template="botanical" />
            </div>
          </div>
        </section>
        <section className="brand-feature-block">
          <div className="brand-feature-number">02 / FIND YOUR FLOW</div>
          <div className="brand-feature-content feature-reverse">
            <div>
              <h2>Right there on the page.</h2>
              <p>
                Double-click to write. Add a section for the next part of your
                story. Arrange pages in a clear outline, with shared navigation
                that follows along.
              </p>
              <ul className="brand-check-list">
                <li>14 section types, ready to make your own</li>
                <li>Reusable sections and shared headers</li>
                <li>Undo, redo, and a little room to experiment</li>
              </ul>
            </div>
            <div className="feature-outline-demo">
              <div>
                <span>YOUR WEBSITE</span>
                <b>
                  Home <small>/</small>
                </b>
                <p>↳ A memorable first impression</p>
                <p>↳ The story behind the idea</p>
                <p>↳ A clear next step</p>
                <b>
                  Our story <small>/about</small>
                </b>
                <b>
                  Say hello <small>/contact</small>
                </b>
              </div>
              <div className="feature-writing-demo">
                <span>YOUR NEXT CHAPTER</span>
                <h3>
                  Good things
                  <br />
                  <em>begin here.</em>
                </h3>
                <span className="feature-text-cursor" />
              </div>
            </div>
          </div>
        </section>
        <section className="brand-feature-block">
          <div className="brand-feature-number">03 / SHARE WITH CONFIDENCE</div>
          <div className="brand-feature-content">
            <div>
              <h2>Ready is when you say.</h2>
              <p>
                Your draft stays yours until you publish. Preview different
                screens, check the details, and launch a complete release in one
                step.
              </p>
              <ul className="brand-check-list">
                <li>Private drafts and deliberate publishing</li>
                <li>Saved releases you can restore</li>
                <li>Portable HTML, CSS, and image exports</li>
              </ul>
              <a className="brand-text-link" href="/help/publish">
                See how publishing works <Arrow />
              </a>
            </div>
            <div className="feature-publish-demo">
              <Brand />
              <div className="feature-publish-status">
                <i /> Ready for its next chapter.
              </div>
              <div className="feature-release-row">
                <span>
                  <b>Your latest idea</b>
                  <small>Saved draft</small>
                </span>
                <span>Ready to publish ↗</span>
              </div>
              <div className="feature-release-row">
                <span>
                  <b>A little room to go back</b>
                  <small>Previous releases stay within reach</small>
                </span>
                <span>↶</span>
              </div>
              <p>
                Keep creating. Your live website changes only when you choose.
              </p>
            </div>
          </div>
        </section>
      </div>
      <FinalCTA />
    </>
  );
}
function Pricing() {
  return (
    <>
      <section className="brand-page-intro">
        <span className="brand-kicker">SIMPLE BY DESIGN</span>
        <h1>
          Room to build.
          <br />
          <span>Freedom to grow.</span>
        </h1>
        <p>
          Start making something without a subscription.
          <br />
          Choose your hosting when you're ready to share it.
        </p>
      </section>
      <section className="brand-pricing-grid">
        <article className="brand-price-card">
          <span className="brand-kicker">BUILD & EXPLORE</span>
          <h2>The local workspace</h2>
          <div className="brand-price">
            $0<span>to use on your computer</span>
          </div>
          <p>
            The complete editing and local publishing flow.
            <br />
            No card. No trial countdown.
          </p>
          <a className="brand-button" href="/signup">
            Create your workspace <Arrow />
          </a>
          <ul className="brand-check-list">
            <li>All four templates and a blank canvas</li>
            <li>Visual editing and responsive previews</li>
            <li>Saved sites, drafts, and release history</li>
            <li>Local publishing, rollback, and export</li>
          </ul>
          <small>Local previews stay on this computer.</small>
        </article>
        <article className="brand-price-card price-hosting">
          <span className="brand-kicker">PUBLISH & GROW</span>
          <h2>Hosting that fits</h2>
          <div className="brand-price price-words">Your choice.</div>
          <p>
            Take an export to your preferred static host,
            <br />
            or configure the included AWS deployment.
          </p>
          <a className="brand-button brand-button-outline" href="/help/hosting">
            Explore the options <Arrow />
          </a>
          <ul className="brand-check-list">
            <li>Portable website files</li>
            <li>Your own infrastructure account</li>
            <li>Usage-based AWS services</li>
            <li>No required Forma hosting subscription</li>
          </ul>
          <small>
            Provider usage and stored data may incur charges.
            <br />
            Cloud hosting is not enabled in the local workspace.
          </small>
        </article>
      </section>
      <section className="brand-pricing-details">
        <span className="brand-kicker">THE DETAILS, UP FRONT</span>
        <h2>A clear place to start.</h2>
        <div>
          {[
            [
              "What is available today?",
              "Forma is a local website builder with a connected workspace and commerce sandbox. There is no paid Forma plan or managed hosting service in this version.",
            ],
            [
              "What does usage-based mean?",
              "The optional AWS setup uses services billed for requests, processing, stored data, and delivery. It has no always-running application server or provisioned database capacity. Your provider’s rates and usage determine your bill.",
            ],
            [
              "Can I build a store?",
              "Manage products, inventory and orders in the local store workspace. Checkout uses an explicit payment simulator; live payments still require a provider integration.",
            ],
            [
              "What are the workspace limits?",
              "The current workspace supports ten sites per account, fifty pages per site, and up to three retained releases. Image and draft size limits help keep storage and publishing manageable.",
            ],
          ].map(([title, body]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>
      <FinalCTA />
    </>
  );
}
function About() {
  return (
    <>
      <div className="about-hero-layout">
        <section className="brand-page-intro brand-about-intro">
          <span className="brand-kicker">A LITTLE ABOUT FORMA</span>
          <h1>
            The internet could use
            <br />
            more <em>you.</em>
          </h1>
          <p>
            Your perspective. Your peculiar little idea.
            <br />
            Your thing that doesn't quite fit the usual mold.
          </p>
        </section>
        <section className="brand-about-photo">
          <img
            src="/images/interior.jpg"
            alt="A quiet, sunlit interior with thoughtfully arranged furniture"
          />
          <div>
            <span>SPACE TO THINK.</span>
            <span>ROOM TO MAKE.</span>
          </div>
        </section>
      </div>
      <section className="brand-about-story">
        <span className="brand-kicker">WHY THIS EXISTS</span>
        <div>
          <h2>
            A website should feel like
            <br />
            something you made.
          </h2>
          <p>
            Not a set of boxes you had to fit into. Not a process that asks you
            to become someone else before you can begin.
          </p>
          <p>
            Forma is built around a simple idea: give people a strong starting
            point and the room to change it. Thoughtful templates. Tools that
            stay close to the work. A clear way to move from a draft to
            something you can share.
          </p>
          <p>
            We care about the small things—the spacing between words, a useful
            undo, the confidence of knowing your draft is safe. Because the
            little details are what make a tool feel good to use.
          </p>
        </div>
      </section>
      <section className="brand-principles">
        {[
          [
            "01",
            "Make space for a point of view.",
            "A template is a beginning. Your choices are what give it a reason to exist.",
          ],
          [
            "02",
            "Keep the work in your hands.",
            "Portable exports, editable backups, and deliberate publishing. You decide what happens next.",
          ],
          [
            "03",
            "Make the useful things feel good.",
            "Clarity is part of the design. Good tools should help you keep going.",
          ],
        ].map(([number, title, body]) => (
          <article key={number}>
            <span>{number}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </section>
      <FinalCTA />
    </>
  );
}
function Help() {
  const [search, setSearch] = useState("");
  const shown = guides.filter((guide) =>
    `${guide.title} ${guide.category} ${guide.steps.flat().join(" ")}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  return (
    <>
      <section className="brand-page-intro brand-help-intro">
        <span className="brand-kicker">THE FORMA HELP CENTER</span>
        <h1>
          A little guidance.
          <br />
          <span>A lot of possibility.</span>
        </h1>
        <p>From your first page to your next big update.</p>
        <label className="brand-help-search">
          <svg
            width="21"
            height="21"
            viewBox="0 0 24 24"
            stroke="currentColor"
            fill="none"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <circle cx="10" cy="10" r="6" />
            <path d="m15 15 6 6" />
          </svg>
          <input
            aria-label="Search guides"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Try “publish”, “images”, or “save”…"
          />
        </label>
      </section>
      <section className="brand-section brand-help-guides">
        <div className="brand-section-heading">
          <h2>Explore the guides.</h2>
          <span className="brand-muted" aria-live="polite">
            {shown.length} guides
          </span>
        </div>
        <div className="brand-guide-grid">
          {shown.map((guide, index) => (
            <a key={guide.id} href={`/help/${guide.id}`}>
              <span className="guide-index">
                0{index + 1} <Arrow diagonal />
              </span>
              <span className="brand-kicker">{guide.category}</span>
              <h3>{guide.title}</h3>
              <span className="guide-time">{guide.time}</span>
            </a>
          ))}
        </div>
        {!shown.length && (
          <div className="brand-empty">
            <h3>No matching guides yet.</h3>
            <p>Try a shorter search, or browse all the guides.</p>
            <button className="brand-button" onClick={() => setSearch("")}>
              Show all guides
            </button>
          </div>
        )}
      </section>
      <section className="brand-section brand-faq">
        <div>
          <span className="brand-kicker">QUICK ANSWERS</span>
          <h2>Good to know.</h2>
        </div>
        <div>
          {faqs.map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <span>+</span>
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>
      <section className="brand-help-note">
        <span>↗</span>
        <div>
          <h2>Looking for your work?</h2>
          <p>
            Your saved sites are in your workspace. Your latest browser draft is
            still in the editor.
          </p>
        </div>
        <a className="brand-text-link" href="/workspace">
          Go to your workspace <Arrow />
        </a>
      </section>
    </>
  );
}
function Guide({ id }: { id: string }) {
  const guide = guides.find((guide) => guide.id === id);
  if (!guide) return <NotFound />;
  return (
    <div className="guide-layout">
      <aside className="guide-contents">
        <a className="brand-text-link" href="/help">
          ← All guides
        </a>
        <span className="brand-kicker">IN THIS GUIDE</span>
        <nav aria-label="Guide contents">
          {guide.steps.map(([title], index) => (
            <a key={title} href={`#step-${index + 1}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {title}
            </a>
          ))}
        </nav>
        <a className="brand-button brand-button-outline" href="/editor">
          Open the editor <Arrow />
        </a>
      </aside>
      <article className="brand-guide-article">
        <header className="guide-article-heading">
          <span className="brand-kicker">
            {guide.category} · {guide.time}
          </span>
          <h1>{guide.title}</h1>
          <p>Follow the steps. Make it your own.</p>
        </header>
        {guide.steps.map(([title, text], index) => (
          <section key={title} id={`step-${index + 1}`}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h2>{title}</h2>
              <p>{text}</p>
            </div>
          </section>
        ))}
        <div className="brand-article-cta">
          <h2>Ready to give it a try?</h2>
          <a className="brand-button" href="/editor">
            Open the editor <Arrow />
          </a>
        </div>
      </article>
    </div>
  );
}

function Privacy() {
  return (
    <article className="brand-guide-article brand-privacy">
      <header className="privacy-heading">
        <span className="brand-kicker">CLEAR BY DESIGN</span>
        <h1>
          Your work.
          <br />
          Your data.
        </h1>
        <p className="brand-article-lead">
          A practical guide to how this version of Forma handles your
          information.
        </p>
      </header>
      <div className="privacy-sections">
        {[
          [
            "Your drafts",
            "The editor saves your current draft in this browser. When you sign in to a workspace, saved drafts are associated with your account. The local workspace stores them on this computer. An AWS deployment stores them in the infrastructure account configured by its operator.",
          ],
          [
            "Your account",
            "Local passwords are stored as salted hashes. Session tokens are held in browser session storage and expire; signing out revokes the local session. The optional AWS setup uses Cognito for sign-in.",
          ],
          [
            "What publishing shares",
            "Publishing makes the pages and images in that release available at its website address. Editable project backups and your private draft library are not included. Local publishing creates a preview address on this computer.",
          ],
          [
            "Images and connected services",
            "Bundled and uploaded images are included in the published release. Remote image URLs are loaded from their providers. Website-editor forms and external checkout links use the services you choose. The local storefront stores carts, order details, customer addresses and form submissions in the local database. Its payment simulator does not collect card details, and its email previews are not sent.",
          ],
          [
            "Storage and recovery",
            "Clearing browser storage can remove your local draft. Keep an exported project backup for important work. Unpublishing removes the live route, but does not delete the saved draft or recall files visitors have already downloaded.",
          ],
          [
            "About this notice",
            "This describes the current local application and optional deployment architecture. A public operator must publish its own privacy policy, contact details, retention policy, and user-request process before offering the service to others.",
          ],
        ].map(([title, body]) => (
          <section key={title}>
            <div>
              <h2>{title}</h2>
              <p>{body}</p>
            </div>
          </section>
        ))}
      </div>
      <a className="brand-text-link" href="/help/save">
        Learn about saving and backups <Arrow />
      </a>
    </article>
  );
}
export function NotFound() {
  return (
    <section className="brand-not-found">
      <span className="brand-kicker">A SMALL DETOUR</span>
      <div className="brand-404">
        4<Brand compact />4
      </div>
      <h1>
        This page hasn't
        <br />
        taken shape.
      </h1>
      <p>The address may have changed. Let's get you somewhere good.</p>
      <div>
        <a className="brand-button" href="/">
          Back to Forma <Arrow />
        </a>
        <a className="brand-text-link" href="/workspace">
          Your workspace <Arrow diagonal />
        </a>
      </div>
    </section>
  );
}
export function PublicSite({ path }: { path: string }) {
  const page =
    path === "/" ? (
      <Home />
    ) : path === "/templates" ? (
      <Templates />
    ) : path === "/features" ? (
      <Features />
    ) : path === "/pricing" ? (
      <Pricing />
    ) : path === "/about" ? (
      <About />
    ) : path === "/help" ? (
      <Help />
    ) : path.startsWith("/help/") ? (
      <Guide id={path.slice(6)} />
    ) : path === "/privacy" ? (
      <Privacy />
    ) : (
      <NotFound />
    );
  return <Shell path={path}>{page}</Shell>;
}

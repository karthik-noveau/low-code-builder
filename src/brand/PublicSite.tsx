import { useState, type CSSProperties } from "react";
import { Icon } from "../studio/Icon";
import { MotionTabs } from "./MotionTabs";
import { Arrow } from "./Brand";
import { Shell, FinalCTA } from "./Shell";
import { TemplateArt } from "./TemplateArt";
import { collections, faqs, guides } from "./content";

function TemplateCard({ item }: { item: (typeof collections)[number] }) {
  return (
    <article className="pub-template" data-reveal>
      <a
        className="pub-template-visual"
        href={`/templates/${item.id}`}
        aria-label={`Preview ${item.name}`}
      >
        <span className="pub-art">
          <TemplateArt template={item.id} />
        </span>
        <span className="pub-template-cta">
          Preview <Arrow diagonal />
        </span>
      </a>
      <div className="pub-template-caption">
        <div>
          <h3>
            <a href={`/templates/${item.id}`}>{item.name}</a>
          </h3>
          <p>
            {item.category} · {item.subtitle}
          </p>
        </div>
        <div className="pub-palette" aria-hidden="true">
          {item.palette.map((color) => (
            <i key={color} style={{ backgroundColor: color }} />
          ))}
        </div>
      </div>
    </article>
  );
}
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
function Home() {
  const [example, setExample] = useState<"studio" | "folio" | "botanical">(
    "botanical",
  );
  const shown = collections.find((template) => template.id === example);
  return (
    <>
      <section className="pub-hero">
        <div className="pub-container">
          <span className="pub-eyebrow">
            <i /> The independent website builder
          </span>
          <h1>
            Big ideas.
            <br />
            <span className="pub-gradient-text">Meet your website.</span>
          </h1>
          <p className="pub-hero-lead">
            Bring your business, portfolio, or next big idea to life. Design it
            visually, run a store, and publish on your own domain.
          </p>
          <div className="pub-hero-actions">
            <a className="pub-btn pub-btn-primary" href="/new">
              Start building <Arrow />
            </a>
            <a className="pub-btn pub-btn-ghost" href="/templates">
              Explore templates
            </a>
          </div>
          <div className="pub-hero-notes">
            <span>
              <Icon name="check" size={14} /> Free to start
            </span>
            <span>
              <Icon name="check" size={14} /> No code required
            </span>
            <span>
              <Icon name="check" size={14} /> Your own domain
            </span>
          </div>
          <div className="pub-showcase">
            <div className="pub-showcase-tabs">
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
            <div className="pub-window" data-tilt>
              <div className="pub-window-bar">
                <span className="pub-window-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="pub-window-url">
                  {shown?.name.toLowerCase().replace(/\s+/g, "")}.com
                </span>
                <a href={`/new?template=${example}`}>
                  Use this template <Arrow />
                </a>
              </div>
              <div className="pub-window-scene" key={example}>
                <TemplateArt template={example} eager />
              </div>
            </div>
          </div>
        </div>
      </section>
      <section
        className="pub-container pub-capabilities"
        aria-label="Platform capabilities"
      >
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
              <span className="pub-label">Templates</span>
              <h2>A starting point. Your point of view.</h2>
              <p>Choose a look you love. Make every detail your own.</p>
            </div>
            <a className="pub-btn pub-btn-ghost" href="/templates">
              All templates <Arrow />
            </a>
          </div>
          <div className="pub-template-grid">
            {[collections[1], collections[2], collections[3]].map((item) => (
              <TemplateCard item={item} key={item.id} />
            ))}
          </div>
        </div>
      </section>
      <section className="pub-section">
        <div className="pub-container pub-split" data-reveal>
          <div className="pub-split-copy">
            <span className="pub-label">How it works</span>
            <h2>From first idea to your own address.</h2>
            <p>
              Your pages, design, and publishing work together. Focus on the
              website you want to build.
            </p>
            <a className="pub-link" href="/help/start">
              See how to get started <Arrow />
            </a>
          </div>
          <div className="pub-steps">
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
              <article className="pub-step" key={number}>
                <span>{number}</span>
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
            <h2>A few useful answers.</h2>
            <p>Everything else lives in the help center.</p>
            <a className="pub-link" href="/help">
              Visit the help center <Arrow />
            </a>
          </div>
          <Faq items={faqs.slice(0, 4)} />
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
      <section className="pub-intro">
        <div className="pub-container">
          <span className="pub-eyebrow">
            <i /> The template collection
          </span>
          <h1>
            A head start.
            <br />
            <span className="pub-gradient-text">Your own style.</span>
          </h1>
          <p className="pub-intro-lead">
            Four distinct starting points, ready for your ideas. Choose a design
            and make every part your own.
          </p>
        </div>
      </section>
      <section className="pub-container" style={{ paddingBottom: 40 }}>
        <div className="pub-toolbar">
          <div className="pub-segmented" aria-label="Template categories">
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
          <label className="pub-search">
            <Icon name="search" size={16} />
            <input
              aria-label="Search templates"
              placeholder="Find your starting point"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <div className="pub-count" aria-live="polite">
          {shown.length} template{shown.length === 1 ? "" : "s"}
        </div>
        <div className="pub-template-grid is-two">
          {shown.map((item) => (
            <TemplateCard item={item} key={item.id} />
          ))}
        </div>
        {!shown.length && (
          <div className="pub-empty">
            <h2>Let's try another direction.</h2>
            <p>No templates match that search.</p>
            <button
              className="pub-btn pub-btn-primary"
              onClick={() => {
                setSearch("");
                setCategory("All templates");
              }}
            >
              See all templates <Arrow />
            </button>
          </div>
        )}
        <div className="pub-banner">
          <span className="pub-banner-icon">
            <Icon name="plus" size={22} />
          </span>
          <div>
            <h2>Or start with nothing but an idea.</h2>
            <p>A blank canvas. A full set of tools. All yours.</p>
          </div>
          <a className="pub-btn pub-btn-ghost" href="/new?template=blank">
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
      <section className="pub-intro">
        <div className="pub-container">
          <span className="pub-eyebrow">
            <i /> Meet your website builder
          </span>
          <h1>
            Everything flows.
            <br />
            <span className="pub-gradient-text">From idea to live.</span>
          </h1>
          <p className="pub-intro-lead">
            A visual canvas, site-wide styles, and a clear path to publishing.
            Everything stays connected as your website grows.
          </p>
          <div className="pub-hero-actions">
            <a className="pub-btn pub-btn-primary" href="/new">
              Try the builder <Arrow />
            </a>
          </div>
        </div>
      </section>
      <div className="pub-container" style={{ paddingBottom: 40 }}>
        <section className="pub-feature" data-reveal>
          <div className="pub-feature-copy">
            <span className="pub-label">01 · Make it yours</span>
            <h2>Your style. Everywhere.</h2>
            <p>
              Choose a palette, set the typography, and give the details a
              little attention. Global styles keep your website feeling like one
              whole idea.
            </p>
            <div className="pub-swatches" aria-label="Try a color palette">
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
          <div className="pub-demo">
            <div
              className="pub-demo-art"
              style={{ "--demo-accent": accent } as CSSProperties}
            >
              <span className="pub-art">
                <TemplateArt template="botanical" />
              </span>
            </div>
          </div>
        </section>
        <section className="pub-feature is-reverse" data-reveal>
          <div className="pub-feature-copy">
            <span className="pub-label">02 · Find your flow</span>
            <h2>Right there on the page.</h2>
            <p>
              Double-click to write. Add a section for the next part of your
              story. Arrange pages in a clear outline, with shared navigation
              that follows along.
            </p>
            <ul className="pub-checks">
              {[
                "14 section types, ready to make your own",
                "Reusable sections and shared headers",
                "Undo, redo, and a little room to experiment",
              ].map((item) => (
                <li key={item}>
                  <Icon name="check" size={15} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="pub-demo pub-outline">
            <div>
              <small>Your website</small>
              <b>
                Home <em>/</em>
              </b>
              <p>↳ A memorable first impression</p>
              <p>↳ The story behind the idea</p>
              <p>↳ A clear next step</p>
              <b>
                Our story <em>/about</em>
              </b>
              <b>
                Say hello <em>/contact</em>
              </b>
            </div>
            <div className="pub-writing">
              <small>Your next chapter</small>
              <h3>
                Good things
                <br />
                <em>begin here.</em>
              </h3>
              <span className="pub-caret" />
            </div>
          </div>
        </section>
        <section className="pub-feature" data-reveal>
          <div className="pub-feature-copy">
            <span className="pub-label">03 · Share with confidence</span>
            <h2>Ready is when you say.</h2>
            <p>
              Your draft stays yours until you publish. Preview different
              screens, check the details, and launch a complete release in one
              step.
            </p>
            <ul className="pub-checks">
              {[
                "Private drafts and deliberate publishing",
                "Saved releases you can restore",
                "Portable HTML, CSS, and image exports",
              ].map((item) => (
                <li key={item}>
                  <Icon name="check" size={15} />
                  {item}
                </li>
              ))}
            </ul>
            <a className="pub-link" href="/help/publish">
              See how publishing works <Arrow />
            </a>
          </div>
          <div className="pub-demo pub-release">
            <div className="pub-release-status">
              <i /> Ready for its next chapter.
            </div>
            <div className="pub-release-row">
              <span>
                <b>Your latest idea</b>
                <small>Saved draft</small>
              </span>
              <span>Ready to publish ↗</span>
            </div>
            <div className="pub-release-row">
              <span>
                <b>A little room to go back</b>
                <small>Previous releases stay within reach</small>
              </span>
              <span>Restore ↶</span>
            </div>
            <p>
              Keep creating. Your live website changes only when you choose.
            </p>
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
      <section className="pub-intro">
        <div className="pub-container">
          <span className="pub-eyebrow">
            <i /> Simple by design
          </span>
          <h1>
            Room to build.
            <br />
            <span className="pub-gradient-text">Freedom to grow.</span>
          </h1>
          <p className="pub-intro-lead">
            Start making something without a subscription. Choose your hosting
            when you're ready to share it.
          </p>
        </div>
      </section>
      <section className="pub-container pub-pricing">
        <article className="pub-price is-featured" data-reveal>
          <span className="pub-label">Build & explore</span>
          <h2>The local workspace</h2>
          <div className="pub-price-amount">
            $0<span>to use on your computer</span>
          </div>
          <p>
            The complete editing and local publishing flow. No card. No trial
            countdown.
          </p>
          <a className="pub-btn pub-btn-primary" href="/signup">
            Create your workspace <Arrow />
          </a>
          <ul className="pub-checks">
            {[
              "All four templates and a blank canvas",
              "Visual editing and responsive previews",
              "Saved sites, drafts, and release history",
              "Local publishing, rollback, and export",
            ].map((item) => (
              <li key={item}>
                <Icon name="check" size={15} />
                {item}
              </li>
            ))}
          </ul>
          <small>Local previews stay on this computer.</small>
        </article>
        <article className="pub-price" data-reveal>
          <span className="pub-label">Publish & grow</span>
          <h2>Hosting that fits</h2>
          <div className="pub-price-amount">Your choice.</div>
          <p>
            Take an export to your preferred static host, or configure the
            included AWS deployment.
          </p>
          <a className="pub-btn pub-btn-ghost" href="/help/hosting">
            Explore the options <Arrow />
          </a>
          <ul className="pub-checks">
            {[
              "Portable website files",
              "Your own infrastructure account",
              "Usage-based AWS services",
              "No required Forma hosting subscription",
            ].map((item) => (
              <li key={item}>
                <Icon name="check" size={15} />
                {item}
              </li>
            ))}
          </ul>
          <small>
            Provider usage and stored data may incur charges. Cloud hosting is
            not enabled in the local workspace.
          </small>
        </article>
      </section>
      <section className="pub-section">
        <div className="pub-container">
          <div className="pub-section-head">
            <div>
              <span className="pub-label">The details, up front</span>
              <h2>A clear place to start.</h2>
            </div>
          </div>
          <div className="pub-qa">
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
        </div>
      </section>
      <FinalCTA />
    </>
  );
}
function About() {
  return (
    <>
      <section className="pub-intro">
        <div className="pub-container">
          <span className="pub-eyebrow">
            <i /> A little about Forma
          </span>
          <h1>
            The internet could use
            <br />
            <span className="pub-gradient-text">more you.</span>
          </h1>
          <p className="pub-intro-lead">
            Your perspective. Your peculiar little idea. Your thing that doesn't
            quite fit the usual mold.
          </p>
        </div>
      </section>
      <div className="pub-container">
        <section className="pub-about-photo" data-reveal>
          <img
            src="/images/interior.jpg"
            alt="A quiet, sunlit interior with thoughtfully arranged furniture"
          />
        </section>
      </div>
      <section className="pub-section">
        <div className="pub-container pub-split">
          <div className="pub-split-copy">
            <span className="pub-label">Why this exists</span>
            <h2>A website should feel like something you made.</h2>
          </div>
          <div className="pub-story">
            <p>
              Not a set of boxes you had to fit into. Not a process that asks
              you to become someone else before you can begin.
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
        </div>
      </section>
      <section className="pub-container pub-principles">
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
          <article key={number} data-reveal>
            <span>{number}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </section>
      <div style={{ height: 80 }} />
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
      <section className="pub-intro">
        <div className="pub-container">
          <span className="pub-eyebrow">
            <i /> Help center
          </span>
          <h1>
            A little guidance.
            <br />
            <span className="pub-gradient-text">A lot of possibility.</span>
          </h1>
          <p className="pub-intro-lead">
            From your first page to your next big update.
          </p>
          <label className="pub-help-search">
            <Icon name="search" size={18} />
            <input
              className="pub-input"
              aria-label="Search guides"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Try “publish”, “images”, or “save”…"
            />
          </label>
        </div>
      </section>
      <section className="pub-container">
        <div className="pub-section-head" style={{ marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 28 }}>Explore the guides</h2>
          </div>
          <span className="pub-muted" aria-live="polite">
            {shown.length} guides
          </span>
        </div>
        <div className="pub-guides">
          {shown.map((guide, index) => (
            <a className="pub-guide" key={guide.id} href={`/help/${guide.id}`}>
              <span className="pub-guide-top">
                {String(index + 1).padStart(2, "0")} <Arrow diagonal />
              </span>
              <span className="pub-label">{guide.category}</span>
              <h3>{guide.title}</h3>
              <span className="pub-guide-time">{guide.time}</span>
            </a>
          ))}
        </div>
        {!shown.length && (
          <div className="pub-empty">
            <h3>No matching guides yet.</h3>
            <p>Try a shorter search, or browse all the guides.</p>
            <button
              className="pub-btn pub-btn-primary"
              onClick={() => setSearch("")}
            >
              Show all guides
            </button>
          </div>
        )}
      </section>
      <section className="pub-section">
        <div className="pub-container pub-split">
          <div className="pub-split-copy">
            <span className="pub-label">Quick answers</span>
            <h2>Good to know.</h2>
          </div>
          <Faq items={faqs} />
        </div>
      </section>
      <div className="pub-container" style={{ paddingBottom: 120 }}>
        <section className="pub-note">
          <span className="pub-banner-icon">
            <Icon name="folder" size={22} />
          </span>
          <div>
            <h2>Looking for your work?</h2>
            <p>
              Your saved sites are in your workspace. Your latest browser draft
              is still in the editor.
            </p>
          </div>
          <a className="pub-btn pub-btn-ghost" href="/workspace">
            Go to your workspace <Arrow />
          </a>
        </section>
      </div>
    </>
  );
}
function Guide({ id }: { id: string }) {
  const guide = guides.find((guide) => guide.id === id);
  if (!guide) return <NotFound />;
  return (
    <div className="pub-container pub-guide-layout">
      <aside className="pub-toc">
        <a className="pub-link" href="/help">
          ← All guides
        </a>
        <span className="pub-label">In this guide</span>
        <nav aria-label="Guide contents">
          {guide.steps.map(([title], index) => (
            <a key={title} href={`#step-${index + 1}`}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {title}
            </a>
          ))}
        </nav>
        <a className="pub-btn pub-btn-ghost pub-btn-small" href="/editor">
          Open the editor <Arrow />
        </a>
      </aside>
      <article className="pub-article">
        <header>
          <span className="pub-label">
            {guide.category} · {guide.time}
          </span>
          <h1>{guide.title}</h1>
          <p>Follow the steps. Make it your own.</p>
        </header>
        {guide.steps.map(([title, text], index) => (
          <section
            className="pub-article-step"
            key={title}
            id={`step-${index + 1}`}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h2>{title}</h2>
              <p>{text}</p>
            </div>
          </section>
        ))}
        <div className="pub-article-cta">
          <h2>Ready to give it a try?</h2>
          <a className="pub-btn pub-btn-primary" href="/editor">
            Open the editor <Arrow />
          </a>
        </div>
      </article>
    </div>
  );
}

function Privacy() {
  return (
    <>
      <section className="pub-intro">
        <div className="pub-container">
          <span className="pub-eyebrow">
            <i /> Clear by design
          </span>
          <h1>
            Your work.
            <br />
            <span className="pub-gradient-text">Your data.</span>
          </h1>
          <p className="pub-intro-lead">
            A practical guide to how this version of Forma handles your
            information.
          </p>
        </div>
      </section>
      <div className="pub-container" style={{ paddingBottom: 120 }}>
        <div className="pub-privacy-sections">
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
              <h2>{title}</h2>
              <p>{body}</p>
            </section>
          ))}
        </div>
        <a className="pub-link" href="/help/save">
          Learn about saving and backups <Arrow />
        </a>
      </div>
    </>
  );
}
export function NotFound() {
  return (
    <section className="pub-container pub-404">
      <div className="pub-404-mark pub-gradient-text" aria-hidden="true">
        404
      </div>
      <h1>This page hasn't taken shape.</h1>
      <p>The address may have changed. Let's get you somewhere good.</p>
      <div className="pub-hero-actions">
        <a className="pub-btn pub-btn-primary" href="/">
          Back to Forma <Arrow />
        </a>
        <a className="pub-btn pub-btn-ghost" href="/workspace">
          Your workspace
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

import { useState, type ReactNode } from "react";
import { Brand, Arrow } from "./Brand";
import { useMotionSurface } from "./useMotionSurface";
import "./brand.css";
import "./product.css";
import "./experience.css";
import "./motion.css";

const navigation = [
  ["/features", "Product"],
  ["/templates", "Templates"],
  ["/pricing", "Pricing"],
  ["/help", "Resources"],
];
export function Header({
  path = "/",
  authenticated = false,
}: {
  path?: string;
  authenticated?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <header className="brand-header">
      <a className="brand-home" href="/" aria-label="Forma home">
        <Brand />
      </a>
      <nav
        className="brand-nav"
        data-open={open}
        aria-label="Main navigation"
        id="main-navigation"
      >
        {navigation.map(([href, label]) => (
          <a
            key={href}
            href={href}
            aria-current={path.startsWith(href) ? "page" : undefined}
          >
            {label}
          </a>
        ))}
      </nav>
      <div className="brand-header-actions">
        <a
          className="brand-signin"
          href={authenticated ? "/workspace" : "/login"}
        >
          {authenticated ? "Your workspace" : "Log in"}
        </a>
        <a
          className="brand-button brand-button-small"
          href={authenticated ? "/new" : "/signup"}
        >
          {authenticated ? "Create website" : "Get started"} <Arrow />
        </a>
        <button
          className="brand-menu-button"
          aria-label={open ? "Close navigation" : "Open navigation"}
          aria-expanded={open}
          aria-controls="main-navigation"
          onClick={() => setOpen(!open)}
        >
          <span />
          <span />
        </button>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="brand-footer">
      <div className="brand-footer-top">
        <div className="brand-footer-intro">
          <a href="/" aria-label="Forma home">
            <Brand />
          </a>
          <p>
            Your website, from first draft
            <br />
            to what’s next.
          </p>
        </div>
        <div>
          <h2>Make it yours</h2>
          <a href="/features">Website builder</a>
          <a href="/templates">Templates</a>
          <a href="/pricing">Pricing & hosting</a>
          <a href="/new">Start a website</a>
        </div>
        <div>
          <h2>Find your way</h2>
          <a href="/help">Guides & help</a>
          <a href="/help/publish">Publishing a website</a>
          <a href="/workspace">Your workspace</a>
          <a href="/editor">Continue your draft</a>
        </div>
        <div>
          <h2>A little more</h2>
          <a href="/about">Our approach</a>
          <a href="/privacy">Data & privacy</a>
          <span className="brand-footer-note">
            Independent ideas
            <br />
            welcome here.
          </span>
        </div>
      </div>
      <div className="brand-footer-bottom">
        <span>© {new Date().getFullYear()} Forma</span>
        <span>Build with intention. Publish with confidence.</span>
        <a href="#main">Back to top ↑</a>
      </div>
    </footer>
  );
}
export function Shell({
  path,
  children,
  footer = true,
  authenticated = false,
}: {
  path?: string;
  children: ReactNode;
  footer?: boolean;
  authenticated?: boolean;
}) {
  const motionRef = useMotionSurface<HTMLDivElement>();
  return (
    <div
      ref={motionRef}
      className={`brand-app brand-page-${path?.split("/")[1] || "home"} ${path === "/" ? "brand-homepage" : ""}`}
    >
      <a className="brand-skip" href="#main">
        Skip to content
      </a>
      <Header path={path} authenticated={authenticated} />
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      {footer && <Footer />}
    </div>
  );
}
export function FinalCTA() {
  return (
    <section className="brand-final-cta" data-reveal>
      <div className="brand-cta-copy">
        <span className="brand-kicker">FROM IDEA TO WEBSITE</span>
        <h2>
          Your website starts here.
          <br />
          Make it your own.
        </h2>
      </div>
      <div className="brand-cta-actions">
        <a className="brand-button" href="/templates">
          Find your starting point <Arrow />
        </a>
        <span className="brand-cta-note">
          Start with a template or a blank canvas.
          <br />
          No code required.
        </span>
      </div>
    </section>
  );
}

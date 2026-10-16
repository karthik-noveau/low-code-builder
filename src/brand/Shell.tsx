import { useState, type ReactNode } from "react";
import { Brand, Arrow } from "./Brand";
import { Icon } from "../studio/Icon";
import { useMotionSurface } from "./useMotionSurface";
import { ThemeSwitch } from "../design/ThemeSwitch";
import "./brand.css";
// The workspace still relies on these older sheets; they load app-wide from here.
import "./product.css";
import "./experience.css";
import "./motion.css";
import "./public.css";

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
    <header className="pub-header">
      <div className="pub-container pub-header-inner">
        <a className="pub-logo" href="/" aria-label="Forma home">
          <Brand />
        </a>
        <nav
          className="pub-nav"
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
        <div className="pub-header-actions">
          <ThemeSwitch variant="button" />
          <a
            className="pub-signin"
            href={authenticated ? "/workspace" : "/login"}
          >
            {authenticated ? "Your workspace" : "Log in"}
          </a>
          <a
            className="pub-btn pub-btn-primary pub-btn-small"
            href={authenticated ? "/new" : "/signup"}
          >
            {authenticated ? "Create website" : "Get started"}
          </a>
          <button
            className="pub-menu-button"
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            aria-controls="main-navigation"
            onClick={() => setOpen(!open)}
          >
            <Icon name={open ? "x" : "menu"} size={18} />
          </button>
        </div>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="pub-footer">
      <div className="pub-container pub-footer-top">
        <div className="pub-footer-intro">
          <a href="/" aria-label="Forma home">
            <Brand />
          </a>
          <p>
            The independent website builder. From first draft to your own
            domain.
          </p>
        </div>
        <div className="pub-footer-col">
          <h2>Product</h2>
          <a href="/features">Website builder</a>
          <a href="/templates">Templates</a>
          <a href="/pricing">Pricing & hosting</a>
          <a href="/new">Start a website</a>
        </div>
        <div className="pub-footer-col">
          <h2>Resources</h2>
          <a href="/help">Guides & help</a>
          <a href="/help/publish">Publishing a website</a>
          <a href="/workspace">Your workspace</a>
          <a href="/editor">Continue your draft</a>
        </div>
        <div className="pub-footer-col">
          <h2>Company</h2>
          <a href="/about">Our approach</a>
          <a href="/privacy">Data & privacy</a>
        </div>
      </div>
      <div className="pub-container pub-footer-bottom">
        <span>© {new Date().getFullYear()} Forma</span>
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
      className={`brand-app brand-public brand-page-${path?.split("/")[1] || "home"}`}
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
    <div className="pub-container">
      <section className="pub-cta" data-reveal>
        <h2>
          Your website starts here.
          <br />
          <span className="pub-gradient-text">Make it your own.</span>
        </h2>
        <p>Start with a template or a blank canvas. No code required.</p>
        <div className="pub-hero-actions">
          <a className="pub-btn pub-btn-primary" href="/templates">
            Find your starting point <Arrow />
          </a>
          <a className="pub-btn pub-btn-ghost" href="/new?template=blank">
            Start from scratch
          </a>
        </div>
      </section>
    </div>
  );
}

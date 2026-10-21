import type { TemplateId } from "../studio/model";

export const brand = {
  name: "Forma",
  tagline: "A little idea. A whole new website.",
  description:
    "Build a website that feels like you. Start with a considered template, make it your own, and publish when you are ready.",
};
export const pageMeta: Record<string, { title: string; description: string }> =
  {
    "/": {
      title: "Forma — Your website workspace",
      description: brand.description,
    },
    "/features": {
      title: "Website builder — Forma",
      description:
        "A visual editor, your own design system, and a clear path to publishing. Meet the tools inside Forma.",
    },
    "/templates": {
      title: "Website templates — Forma",
      description:
        "Explore original starting points for portfolios, independent businesses, restaurants, and collections.",
    },
    "/pricing": {
      title: "Pricing & hosting — Forma",
      description:
        "Start locally at no cost. Export your website or connect usage-based hosting when you are ready.",
    },
    "/about": {
      title: "Our approach — Forma",
      description:
        "Good tools leave room for your point of view. Discover the thinking behind Forma.",
    },
    "/help": {
      title: "Guides & help — Forma",
      description:
        "Get started, shape your pages, save your work, and take your first website live with Forma.",
    },
    "/privacy": {
      title: "Data & privacy — Forma",
      description:
        "Understand where your Forma drafts, account details, images, and published pages are stored.",
    },
    "/login": {
      title: "Welcome back — Forma",
      description: "Sign in to your Forma workspace.",
    },
    "/signup": {
      title: "Make something yours — Forma",
      description:
        "Create your local Forma workspace and start your next website.",
    },
    "/domains": {
      title: "Domains & publishing — Forma",
      description:
        "Connect your own domain, configure HTTPS, and manage your published website.",
    },
    "/workspace": {
      title: "Your websites — Forma",
      description: "A home for your ideas, drafts, and published websites.",
    },
    "/workspace/templates": {
      title: "Templates — Forma",
      description: "Preview the templates and start a website from one.",
    },
    "/new": {
      title: "Start a website — Forma",
      description: "Choose a starting point and give your new website a name.",
    },
    "/editor": {
      title: "Website Studio — Forma",
      description: "Design, edit, preview, and publish your website.",
    },
  };
export const collections: {
  id: TemplateId;
  name: string;
  category: string;
  subtitle: string;
  image: string;
  palette: string[];
}[] = [
  {
    id: "botanical",
    name: "Botanical",
    category: "Storefront",
    subtitle: "A fresh perspective on everyday things.",
    image: "/images/botanical.jpg",
    palette: ["#294b3b", "#f4f3e7", "#c4cfb3"],
  },
  {
    id: "folio",
    name: "Forma Studio",
    category: "Portfolio",
    subtitle: "Let the work do the talking.",
    image: "/images/architecture.jpg",
    palette: ["#2f3439", "#ece9e1", "#b2afa5"],
  },
  {
    id: "studio",
    name: "Common Ground",
    category: "Business",
    subtitle: "A thoughtful first impression.",
    image: "/images/interior.jpg",
    palette: ["#68533d", "#f3eee4", "#c4baaa"],
  },
  {
    id: "table",
    name: "Sunday Table",
    category: "Restaurant",
    subtitle: "A warm welcome, before the first visit.",
    image: "/images/restaurant.jpg",
    palette: ["#843d2b", "#faf0df", "#c39070"],
  },
];
export const guides = [
  {
    id: "domains",
    category: "Domains & publishing",
    title: "Go live on a domain you own",
    time: "5 min read",
    steps: [
      [
        "Start with a saved website",
        "Create or save your site in a workspace. Open Domains & publish from Your websites or from the editor’s Workspace panel. Add your hostname without https:// or a path. Root and www addresses are separate connections.",
      ],
      [
        "Prove ownership and secure the address",
        "Add the TXT ownership record to your DNS provider and choose Check connection. Once verified, Forma prepares an HTTPS certificate and displays its CNAME validation record. Keep that certificate CNAME in place for automatic renewal.",
      ],
      [
        "Point your DNS",
        "After HTTPS is ready, point your hostname to the CloudFront target shown in the workspace. For a root domain use ALIAS or CNAME flattening; for a subdomain use CNAME. Do not replace email records. Check connection verifies valid HTTPS and the identity of your site before connecting it.",
      ],
      [
        "Publish, then keep improving",
        "Make the connected domain primary and publish the saved draft. New edits remain private until the next publish. Restore a release to roll back the live website; unpublish takes all its addresses offline. Disconnect pauses only that domain.",
      ],
      [
        "Practice locally first",
        "In local mode, expand Local DNS simulator, apply the displayed records, and check the connection. Repeat for the HTTPS and routing steps. The preview stays on this computer: real public DNS and certificates are created only in a configured AWS deployment.",
      ],
    ],
  },
  {
    id: "start",
    category: "Getting started",
    title: "From an idea to your first draft",
    time: "3 min read",
    steps: [
      [
        "Choose your starting point",
        "Browse Templates and open a full preview. Use a template you like, or start with a blank canvas. Give your website a name; you can change it later.",
      ],
      [
        "Make it feel like you",
        "Open Site styles in the editor to choose colors, type, and corner styles. Double-click text on the canvas to rewrite it, and use the section settings to change images.",
      ],
      [
        "Build one good page first",
        "Start with a clear heading, a short introduction, and one useful next step. Preview desktop, tablet, and mobile before adding more pages.",
      ],
    ],
  },
  {
    id: "design",
    category: "Designing your site",
    title: "Make a template your own",
    time: "4 min read",
    steps: [
      [
        "Set a simple visual direction",
        "Choose one accent color and a type style. Keep the same rhythm of spacing throughout the page. Your global Site styles keep shared choices consistent.",
      ],
      [
        "Work with sections",
        "Add a section from the library, drag it in the navigator, or use its action menu to move and duplicate it. Save useful sections to reuse elsewhere. Headers and footers appear across your website.",
      ],
      [
        "Give every page a purpose",
        "Use the page settings for its name, address, title, and description. Write helpful image descriptions. The Review site tool points you to missing details before publishing.",
      ],
    ],
  },
  {
    id: "save",
    category: "Your workspace",
    title: "Keep your work safe",
    time: "3 min read",
    steps: [
      [
        "Browser drafts and saved sites",
        "The editor keeps a draft in this browser. Sign in and save it as a site to keep a copy in your workspace as well. Workspace autosave runs after ten seconds without changes.",
      ],
      [
        "Opening another website",
        "The editor keeps a recovery copy before replacing a different browser draft. If two sessions edit the same saved version, syncing pauses so your work is not silently overwritten. Reload the saved site, or save your edits as a new site.",
      ],
      [
        "Take a backup with you",
        "Export an editable project backup from the editor. Keep that file somewhere you trust. You can import it later from Settings. Browser storage can be cleared, so keep a backup of important work.",
      ],
    ],
  },
  {
    id: "publish",
    category: "Going live",
    title: "Publish with room to change your mind",
    time: "4 min read",
    steps: [
      [
        "Check the details",
        "Preview each page and use Review site. Confirm your buttons lead somewhere useful. Forms need a submission endpoint, and product buttons need your checkout or product links.",
      ],
      [
        "Publish your saved draft",
        "Open Workspace in the editor, save the site, and choose Publish changes. The site is built before its live address switches to the new release. In local mode, that address is a preview on this computer.",
      ],
      [
        "Make another change",
        "Edits stay in your draft until you publish again. Release history keeps up to three successful releases. Restore one to change the live website without changing your draft, or unpublish to take the website offline.",
      ],
    ],
  },
  {
    id: "hosting",
    category: "Hosting & export",
    title: "Choose where your website lives",
    time: "3 min read",
    steps: [
      [
        "Start on your computer",
        "The local workspace lets you try the complete save-and-publish flow without an AWS account. Local preview links work on this computer; they are not public internet addresses.",
      ],
      [
        "Export a portable website",
        "Export site downloads HTML, CSS, images, and an editable project backup. Keep the files together when uploading them to a static host. Remote image URLs remain linked to their original source.",
      ],
      [
        "Connect cloud hosting when ready",
        "The project includes an optional AWS deployment path. Hosting is billed by the provider for usage and stored data. Live deployment is disabled by default and requires your account configuration; it is not a paid Forma subscription.",
      ],
    ],
  },
];
export const faqs = [
  [
    "Do I need to know how to code?",
    "No. Change text, images, colors, pages, and sections visually. You can export the finished HTML and CSS whenever you need them.",
  ],
  [
    "Is my website public when I edit it?",
    "No. Editing changes your draft. You choose when to publish. In the local workspace, even published previews stay on this computer.",
  ],
  [
    "Can I move my website elsewhere?",
    "Yes. Export your static website to host it elsewhere, and keep the editable project backup so you can continue working in Forma.",
  ],
  [
    "Can I sell products?",
    "Store management includes a local catalog, inventory, cart, sandbox checkout, orders and refunds. Enable catalog links in Markets to connect your published website. Live payment processing is not connected.",
  ],
  [
    "What happens if I make a mistake?",
    "Use undo in the editor, restore a browser recovery copy after switching sites, or roll back the live website to a retained release.",
  ],
];

import type { TemplateId } from "../studio/model";

export const brand = {
  name: "Skynoveau Builder",
  tagline: "A little idea. A whole new website.",
  description:
    "Build a website that feels like you. Start with a considered template, make it your own, and publish when you are ready.",
};
export const pageMeta: Record<string, { title: string; description: string }> =
  {
    "/": {
      title: "Skynoveau Builder — Your website workspace",
      description: brand.description,
    },
    "/features": {
      title: "Website builder — Skynoveau Builder",
      description:
        "A visual editor, your own design system, and a clear path to publishing. Meet the tools inside Skynoveau.",
    },
    "/templates": {
      title: "Website templates — Skynoveau Builder",
      description:
        "Working business templates: an online store, restaurant ordering, grocery delivery, salon bookings, home services, tuition, events, a gym and a studio.",
    },
    "/pricing": {
      title: "Pricing & hosting — Skynoveau Builder",
      description:
        "Start locally at no cost. Export your website or connect usage-based hosting when you are ready.",
    },
    "/about": {
      title: "Our approach — Skynoveau Builder",
      description:
        "Good tools leave room for your point of view. Discover the thinking behind Skynoveau.",
    },
    "/help": {
      title: "Guides & help — Skynoveau Builder",
      description:
        "Get started, shape your pages, save your work, and take your first website live with Skynoveau.",
    },
    "/privacy": {
      title: "Data & privacy — Skynoveau Builder",
      description:
        "Understand where your Skynoveau drafts, account details, images, and published pages are stored.",
    },
    "/enterprise": {
      title: "Enterprise — Skynoveau Builder",
      description:
        "Websites, stores and custom business apps on one platform, deployed on your own cloud and shaped to your requirements.",
    },
    "/migrate": {
      title: "Move from Shopify or Wix — Skynoveau Builder",
      description:
        "Bring products, customers and old links over from Shopify or Wix. Preview every file before it's saved, and keep your search rankings.",
    },
    "/login": {
      title: "Welcome back — Skynoveau Builder",
      description: "Sign in to your Skynoveau workspace.",
    },
    "/signup": {
      title: "Make something yours — Skynoveau Builder",
      description:
        "Create your local Skynoveau workspace and start your next website.",
    },
    "/domains": {
      title: "Domains & publishing — Skynoveau Builder",
      description:
        "Connect your own domain, configure HTTPS, and manage your published website.",
    },
    "/workspace": {
      title: "Your websites — Skynoveau Builder",
      description: "A home for your ideas, drafts, and published websites.",
    },
    "/workspace/templates": {
      title: "Templates — Skynoveau Builder",
      description: "Preview the templates and start a website from one.",
    },
    "/new": {
      title: "Start a website — Skynoveau Builder",
      description: "Choose a starting point and give your new website a name.",
    },
    "/editor": {
      title: "Website Studio — Skynoveau Builder",
      description: "Design, edit, preview, and publish your website.",
    },
  };
/**
 * The template gallery. Every template is a working business, not a mock-up:
 * `works` says what a visitor can do on it the day it's published.
 */
export const collections: {
  id: TemplateId;
  name: string;
  category: string;
  subtitle: string;
  /** What works out of the box, shown on cards and previews. */
  works: string[];
  image: string;
  palette: string[];
}[] = [
  {
    id: "botanical",
    name: "Botanical",
    category: "Shop",
    subtitle: "An online plant shop with cart, checkout and order tracking.",
    works: [
      "Products with stock",
      "Cart & checkout",
      "Customer accounts",
      "Order tracking",
    ],
    image: "/images/botanical.jpg",
    palette: ["#294b3b", "#f4f3e7", "#c4cfb3"],
  },
  {
    id: "table",
    name: "Sunday Table",
    category: "Food",
    subtitle:
      "Takes orders and payments from your menu, tracks deliveries and books tables.",
    works: [
      "Order from the menu",
      "Pay online",
      "Track order",
      "Reserve a table",
    ],
    image: "/images/restaurant.jpg",
    palette: ["#843d2b", "#faf0df", "#c39070"],
  },
  {
    id: "freshbasket",
    name: "Fresh Basket",
    category: "Food",
    subtitle:
      "Grocery delivery with a cart, delivery slots that fill up and payment.",
    works: [
      "Cart from your products",
      "Delivery slots",
      "Pay online",
      "Track order",
    ],
    image: "/images/groceries.jpg",
    palette: ["#2f9e44", "#f8fbf5", "#b9dcb0"],
  },
  {
    id: "volt",
    name: "Volt Electricals",
    category: "Shop",
    subtitle:
      "A shop catalogue with a phone-number rewards club and warranty register.",
    works: [
      "Join rewards",
      "Record a purchase",
      "My rewards",
      "Register warranty",
    ],
    image: "/images/electrical-shop.jpg",
    palette: ["#e8730c", "#26292e", "#fff1e3"],
  },
  {
    id: "dhanlaxmi",
    name: "Dhanlaxmi Electricals",
    category: "Shop",
    subtitle:
      "Buy from us. Earn rewards. Purchases recorded by phone, approved by the owner.",
    works: [
      "Add a purchase",
      "Owner approval with reward",
      "My rewards",
      "Installs as an app",
    ],
    image: "/images/electrical-shop.jpg",
    palette: ["#e07400", "#22262b", "#fff8f0"],
  },
  {
    id: "glow",
    name: "Glow Studio",
    category: "Services",
    subtitle: "A salon or clinic that books services into free time slots.",
    works: [
      "Service menu",
      "Book a free slot",
      "Email confirmations",
      "My bookings",
    ],
    image: "/images/salon.jpg",
    palette: ["#b5655a", "#fdf8f6", "#e8c4ba"],
  },
  {
    id: "fixright",
    name: "FixRight",
    category: "Services",
    subtitle:
      "Home services that take visit requests, schedule technicians and track jobs.",
    works: [
      "Request a visit",
      "Technician scheduling",
      "Charges recorded",
      "Track request",
    ],
    image: "/images/home-tools.jpg",
    palette: ["#1f6feb", "#f7f9fc", "#b8cdf2"],
  },
  {
    id: "brightminds",
    name: "Bright Minds",
    category: "Education",
    subtitle:
      "A tuition centre with admissions by seats left and a fee record for parents.",
    works: ["Courses & fees", "Admissions until full", "Students", "My fees"],
    image: "/images/classroom.jpg",
    palette: ["#2d5bd3", "#fffdf7", "#c4d1f4"],
  },
  {
    id: "studio",
    name: "Common Ground",
    category: "Events",
    subtitle:
      "Workshops and events that sell seats until they’re full, plus careers.",
    works: ["Book seats", "Sold-out limits", "My tickets", "Apply for a role"],
    image: "/images/interior.jpg",
    palette: ["#68533d", "#f3eee4", "#c4baaa"],
  },
  {
    id: "pulse",
    name: "Pulse Fitness",
    category: "Fitness",
    subtitle:
      "A gym that sells plans online and rewards every check-in with points.",
    works: ["Join & pay online", "Members", "Check in for points", "My card"],
    image: "/images/gym.jpg",
    palette: ["#e5484d", "#151a25", "#eef0f6"],
  },
  {
    id: "folio",
    name: "Forma Studio",
    category: "Portfolio",
    subtitle:
      "Case studies with their own pages and a project enquiry pipeline with quotes.",
    works: ["Case study pages", "Project enquiries", "Quotes", "Track enquiry"],
    image: "/images/architecture.jpg",
    palette: ["#2f3439", "#ece9e1", "#b2afa5"],
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
        "Save your website to your workspace, then open Domains on its card in Your websites. Type just the address, like www.mybakery.com. Your main domain (mybakery.com) and www.mybakery.com are added separately.",
      ],
      [
        "Prove ownership and secure the address",
        "Skynoveau shows a record to add where you bought your domain (your domain provider). Copy its name and value into a new record of the type shown, then choose Check connection. Next, Skynoveau shows a second record that secures your site with HTTPS. Add it the same way and leave it in place so the security certificate keeps renewing.",
      ],
      [
        "Point your domain to Skynoveau",
        "The last record sends visitors to your website. For www and other subdomains it is a CNAME. A main domain needs an ALIAS record (some providers call it ANAME); if yours doesn’t offer one, use www instead. Don’t change your email records. Check connection confirms everything works before your domain goes live.",
      ],
      [
        "Publish, then keep improving",
        "Make the domain your primary address and publish. New edits stay private until you publish again. If something goes wrong, put an earlier published version back live. Take it offline hides the website everywhere; Disconnect pauses just that one domain.",
      ],
      [
        "Practice first",
        "In practice mode, open “Practice: add these records for me”, choose “Pretend I’ve added these records”, then Check connection. Repeat for each step. Nothing changes on the real internet, so you can rehearse safely.",
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
    id: "migrate",
    category: "Moving to Skynoveau",
    title: "Move your store from Shopify or Wix",
    time: "5 min read",
    steps: [
      [
        "Export from your old store",
        "In Shopify, export all products and all customers as plain CSV files (Products → Export, Customers → Export). In Wix, export your catalog from Store Products and your contacts from Contacts. Shopify’s URL redirects export (Online Store → Navigation) is worth taking too.",
      ],
      [
        "Import products and customers",
        "Open your store, choose Import & migrate and drop in each file. Skynoveau recognises where it came from, shows you what it found and anything that won’t come across, and saves nothing until you choose Import. Running the same file again never makes duplicates.",
      ],
      [
        "Keep your old links working",
        "Imported products keep their old address: /products/… and /product-page/… forward to the same product in your Skynoveau store when you publish. For pages and blog posts, add moved pages in the editor’s Settings, or import Shopify’s redirect CSV there.",
      ],
      [
        "Switch your domain",
        "Your old store keeps selling until you point your domain at Skynoveau. Connect it from Domains, publish, check a few old links, then cancel your old plan.",
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
        "The project includes an optional AWS deployment path. Hosting is billed by the provider for usage and stored data. Live deployment is disabled by default and requires your account configuration; it is not a paid Skynoveau subscription.",
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
    "Yes. Export your static website to host it elsewhere, and keep the editable project backup so you can continue working in Skynoveau.",
  ],
  [
    "Can I sell products?",
    "Yes. Store management has products, stock, a cart, checkout, orders and refunds. Turn on catalog links in Markets to show your products on your published website. Checkout currently uses test payments, so no real money is taken yet.",
  ],
  [
    "What happens if I make a mistake?",
    "Use Undo in the editor, recover the copy your browser keeps when you switch websites, or put an earlier published version of your website back live.",
  ],
];
export const enterpriseFaqs = [
  [
    "Can Skynoveau really handle our requirement?",
    "Skynoveau combines pages, a store and business apps (tables, forms, workflow steps, roles and dashboards) that share the same records, so most requirements are built on the platform rather than around it. Bring the requirement and we’ll show you a working version.",
  ],
  [
    "Where is our data stored?",
    "In the AWS account you choose: DynamoDB for records and orders, S3 and CloudFront for published sites and images, and Cognito for sign-in. Everything exports to CSV.",
  ],
  [
    "How do people get access?",
    "Owners invite collaborators as managers, editors or viewers. Each change to the store is recorded in its activity log.",
  ],
  [
    "Does it connect to our other systems?",
    "Orders and product changes are available as signed event feeds for your own tools, and every list exports to CSV. Payments go through your Stripe or Razorpay account.",
  ],
  [
    "Can we move an existing store?",
    "Yes. Shopify and Wix product and customer exports import as they are, and old product links keep working. See the migration page for exactly what comes across.",
  ],
] as const;
export const migrationFaqs = [
  [
    "Will I lose my search rankings?",
    "Old product and collection addresses forward to the same product in your Skynoveau store, and you can add any other page, or import Shopify’s redirect list. Search engines follow these to the new pages.",
  ],
  [
    "Do my customers need new passwords?",
    "No. Customers sign in to their account with a one-time code sent to their email, so there are no passwords to move or reset.",
  ],
  [
    "What happens to customers who opted in to marketing?",
    "They join your newsletter list with their consent carried over. Nobody is emailed during the import.",
  ],
  [
    "What about my past orders?",
    "Each customer’s order count and total spend come across. The orders themselves stay in your old store’s export for your records.",
  ],
  [
    "Can I try it before switching?",
    "Yes. Import into a new workspace, check everything, and keep selling on your old store until you point your domain at Skynoveau.",
  ],
] as const;

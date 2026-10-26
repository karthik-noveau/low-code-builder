/**
 * Site templates. Each business template is a complete, working business:
 * pages and copy, the collections visitors browse (menu, services, courses…)
 * and the business app that takes their orders, bookings and sign-ups. The
 * apps come from src/apps/templates.ts, so a restaurant site and the "Orders &
 * delivery" app template share one definition. Botanical is an online store
 * run by Forma Store; its products are seeded after the site is saved.
 */
import { type Project, type TemplateId } from "./model";
import { createSection, page, type SiteParts } from "./sites/kit";
import {
  botanical,
  botanicalProducts,
  type SeedProduct,
} from "./sites/botanical";
import { sundayTable } from "./sites/table";
import { volt } from "./sites/volt";
import { dhanlaxmi } from "./sites/dhanlaxmi";
import { glow } from "./sites/glow";
import { fixRight } from "./sites/fixright";
import { brightMinds } from "./sites/brightminds";
import { commonGround } from "./sites/commonground";
import { pulse } from "./sites/pulse";
import { formaStudio } from "./sites/folio";
import { freshBasket } from "./sites/freshbasket";

export { createSection };
export type { SeedProduct };

export interface TemplateOption {
  id: TemplateId;
  name: string;
  category: string;
  /** What works out of the box, in a sentence. */
  description: string;
  image: string;
  color: string;
}
export const templateOptions: TemplateOption[] = [
  {
    id: "botanical",
    name: "Botanical",
    category: "Shop",
    description:
      "An online plant shop: products with stock and prices, cart, checkout, customer accounts and order tracking.",
    image: "/images/botanical.jpg",
    color: "#294b3b",
  },
  {
    id: "table",
    name: "Sunday Table",
    category: "Food",
    description:
      "A restaurant that takes orders from its menu with payment, tracks them to the door and books tables by sitting.",
    image: "/images/restaurant.jpg",
    color: "#843d2b",
  },
  {
    id: "freshbasket",
    name: "Fresh Basket",
    category: "Food",
    description:
      "Grocery delivery: a cart from your products, delivery slots that fill up, online payment and order tracking.",
    image: "/images/groceries.jpg",
    color: "#2f9e44",
  },
  {
    id: "volt",
    name: "Volt Electricals",
    category: "Shop",
    description:
      "A counter shop with a product catalogue, a rewards club customers join by phone, and a warranty register.",
    image: "/images/electrical-shop.jpg",
    color: "#e8730c",
  },
  {
    id: "dhanlaxmi",
    name: "Dhanlaxmi Electricals",
    category: "Shop",
    description:
      "The Dhanlaxmi Rewards app: customers record purchases by phone, you approve each with a reward, they check their total.",
    image: "/images/electrical-shop.jpg",
    color: "#e07400",
  },
  {
    id: "glow",
    name: "Glow Studio",
    category: "Services",
    description:
      "A salon or clinic: a priced service menu, bookings into free time slots, confirmations by email and My bookings.",
    image: "/images/salon.jpg",
    color: "#b5655a",
  },
  {
    id: "fixright",
    name: "FixRight",
    category: "Services",
    description:
      "Home services: visit requests by service, technician scheduling, charges recorded and tracking by reference.",
    image: "/images/home-tools.jpg",
    color: "#1f6feb",
  },
  {
    id: "brightminds",
    name: "Bright Minds",
    category: "Education",
    description:
      "A tuition centre: courses with fees, admissions that stop when seats run out, students and a fee record for parents.",
    image: "/images/classroom.jpg",
    color: "#2d5bd3",
  },
  {
    id: "studio",
    name: "Common Ground",
    category: "Events",
    description:
      "Workshops and events with seat limits, bookings, tickets found by email, plus open roles with applications.",
    image: "/images/interior.jpg",
    color: "#68533d",
  },
  {
    id: "pulse",
    name: "Pulse Fitness",
    category: "Fitness",
    description:
      "A gym: plans members join and pay for online, check-ins that earn points, and a loyalty card on their phone.",
    image: "/images/gym.jpg",
    color: "#e5484d",
  },
  {
    id: "folio",
    name: "Forma Studio",
    category: "Portfolio",
    description:
      "A design studio: case studies with their own pages and a project enquiry pipeline with quotes and tracking.",
    image: "/images/architecture.jpg",
    color: "#2f3439",
  },
  {
    id: "blank",
    name: "A blank canvas",
    category: "Start fresh",
    description: "Your idea. Your direction. Build something entirely yours.",
    image: "",
    color: "#526954",
  },
];
const builders: Record<
  Exclude<TemplateId, "blank">,
  (brand: string) => SiteParts
> = {
  botanical,
  table: sundayTable,
  freshbasket: freshBasket,
  volt,
  dhanlaxmi,
  glow,
  fixright: fixRight,
  brightminds: brightMinds,
  studio: commonGround,
  pulse,
  folio: formaStudio,
};

/**
 * A new project from a template. `siteName` names the business in headers,
 * footers, page titles and the installed app; the template's own name otherwise.
 */
export function createProject(
  template: TemplateId = "botanical",
  siteName?: string,
): Project {
  const option =
    templateOptions.find((t) => t.id === template) ?? templateOptions[0];
  const brand =
    siteName?.trim() || (template === "blank" ? "Untitled site" : option.name);
  if (template === "blank") {
    const header = [
      createSection("announcement", {
        title: "Independent minds. Thoughtful work. A fresh perspective.",
        hidden: true,
        buttonUrl: "/",
      }),
      createSection("header", {
        title: brand,
        buttonLabel: "",
        buttonUrl: "/",
      }),
    ];
    return {
      version: 1,
      name: brand,
      template,
      header,
      footer: [
        createSection("footer", {
          title: brand,
          body: "Made with care. Made for you.",
          background: option.color,
        }),
      ],
      pages: [
        page(
          "Home",
          "",
          `Discover ${brand}. Thoughtfully made, just for you.`,
          [],
          brand,
        ),
      ],
      assets: [],
      theme: {
        accent: option.color,
        background: "#fcfcf9",
        color: "#25352b",
        font: "editorial",
        radius: 2,
      },
    };
  }
  const site = builders[template](brand);
  return {
    version: 1,
    name: brand,
    template,
    header: site.header,
    footer: site.footer,
    pages: site.pages,
    assets: [],
    theme: site.theme,
    ...(site.collections?.length ? { collections: site.collections } : {}),
    ...(site.app ? { app: site.app } : {}),
  };
}

/**
 * Products to add to Forma Store when a site starts from this template, and
 * the store settings that put them on the website. Undefined for templates
 * that don't sell through the store.
 */
export function storeSeed(template: TemplateId):
  | {
      products: SeedProduct[];
      settings: {
        enabled: true;
        linkFromWebsite: true;
        useCatalogOnWebsite: true;
      };
    }
  | undefined {
  if (template !== "botanical") return undefined;
  return {
    products: botanicalProducts,
    settings: {
      enabled: true,
      linkFromWebsite: true,
      useCatalogOnWebsite: true,
    },
  };
}

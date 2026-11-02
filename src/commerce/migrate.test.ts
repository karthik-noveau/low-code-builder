import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";
import { cents, parseExport, plainText, UNTRACKED_STOCK } from "./migrate";

const csv = (lines: string[]) => parseCsv(lines.join("\n"));

// Shopify's product export: the first row of each handle carries the
// product; later rows add variants or extra images.
const SHOPIFY_HEAD =
  "Handle,Title,Body (HTML),Vendor,Product Category,Type,Tags,Published,Option1 Name,Option1 Value,Option2 Name,Option2 Value,Option3 Name,Option3 Value,Variant SKU,Variant Grams,Variant Inventory Tracker,Variant Inventory Qty,Variant Inventory Policy,Variant Fulfillment Service,Variant Price,Variant Compare At Price,Variant Requires Shipping,Variant Taxable,Variant Barcode,Image Src,Image Position,Image Alt Text,Gift Card,SEO Title,SEO Description,Variant Image,Variant Weight Unit,Status";

describe("Shopify products", () => {
  const parsed = parseExport(
    csv([
      SHOPIFY_HEAD,
      'monstera-deliciosa,Monstera Deliciosa,"<p>A <strong>big</strong> leafy plant.</p><ul><li>Easy</li><li>Fast</li></ul>",Leafy Co,Home & Garden > Plants > Indoor Plants,Indoor plants,"plants, big",TRUE,Size,Small,Pot,Clay,,,MON-S-C,500,shopify,12,deny,manual,24.00,30.00,TRUE,TRUE,,https://cdn.shopify.com/s/files/monstera.jpg,1,Monstera,FALSE,,,,g,active',
      "monstera-deliciosa,,,,,,,,,Small,,Plastic,,,MON-S-P,500,shopify,0,deny,manual,20.00,,TRUE,TRUE,,https://cdn.shopify.com/s/files/monstera-2.jpg,2,,,,,,g,",
      'monstera-deliciosa,,,,,,,,,Large,,Clay,,,MON-L-C,900,,,deny,manual,"1,049.50",,TRUE,TRUE,,,,,,,,,g,',
      "monstera-deliciosa,,,,,,,,,,,,,,,,,,,,,,,,,https://cdn.shopify.com/s/files/monstera-3.jpg,3,,,,,,,",
      "gift-note,Gift note,,,,,,FALSE,Title,Default Title,,,,,NOTE,0,,,deny,manual,2.5,,FALSE,FALSE,,,,,,,,,,draft",
      "no-price,Broken,,,,,,TRUE,Title,Default Title,,,,,X,0,,,deny,manual,,,,,,,,,,,,,,active",
    ]),
  );
  it("groups variants under their product and reads every field", () => {
    expect(parsed.kind).toBe("products");
    if (parsed.kind !== "products") return;
    expect(parsed.source).toBe("shopify");
    expect(parsed.products).toHaveLength(2);
    const [monstera, note] = parsed.products;
    expect(monstera).toMatchObject({
      title: "Monstera Deliciosa",
      handle: "monstera-deliciosa",
      collection: "Indoor plants",
      image: "https://cdn.shopify.com/s/files/monstera.jpg",
      status: "active",
    });
    expect(monstera.description).toBe("A big leafy plant.\n• Easy\n• Fast");
    expect(monstera.variants).toEqual([
      {
        title: "Small / Clay",
        sku: "MON-S-C",
        price: 2400,
        stock: 12,
        prices: {},
      },
      {
        title: "Small / Plastic",
        sku: "MON-S-P",
        price: 2000,
        stock: 0,
        prices: {},
      },
      {
        title: "Large / Clay",
        sku: "MON-L-C",
        price: 104950,
        stock: UNTRACKED_STOCK,
        prices: {},
      },
    ]);
    expect(note).toMatchObject({ status: "draft", handle: "gift-note" });
    expect(note.variants).toEqual([
      {
        title: "Default",
        sku: "NOTE",
        price: 250,
        stock: UNTRACKED_STOCK,
        prices: {},
      },
    ]);
  });
  it("says what didn't come across", () => {
    expect(parsed.notes.join(" ")).toMatch(/1 product without a price/);
    expect(parsed.notes.join(" ")).toMatch(/2 variants didn’t track stock/);
    expect(parsed.notes.join(" ")).toMatch(/compare at/);
  });
});

describe("Wix products", () => {
  const HEAD =
    "handleId,fieldType,name,description,productImageUrl,collection,sku,ribbon,price,surcharge,visible,discountMode,discountValue,inventory,weight,cost,productOptionName1,productOptionType1,productOptionDescription1,productOptionName2,productOptionType2,productOptionDescription2";
  it("reads products, variant rows with surcharges, and option combinations", () => {
    const parsed = parseExport(
      csv([
        HEAD,
        'product_1a2b,Product,Linen Shirt,"<p>Soft linen.</p>",a1b2c3~mv2.jpg;d4e5~mv2.jpg,Shirts;Summer,LIN,,40,,true,PERCENT,10,InStock,0.3,,Size,DROP_DOWN,S;M;L,,,',
        "product_1a2b,Variant,,,,,LIN-S,,,0,true,,,7,,,,,S,,,",
        "product_1a2b,Variant,,,,,LIN-L,,,5,true,,,OutOfStock,,,,,L,,,",
        "product_1a2b,Variant,,,,,LIN-M,,,0,false,,,3,,,,,M,,,",
        "product_9z,Product,Tote Bag,,https://static.wixstatic.com/media/tote.jpg,,TOTE,,15.5,,false,,,OutOfStock,,,Colour,COLOR,Red;Blue,Size,DROP_DOWN,S;L",
      ]),
    );
    expect(parsed.kind === "products" && parsed.source).toBe("wix");
    if (parsed.kind !== "products") return;
    const [shirt, tote] = parsed.products;
    expect(shirt).toMatchObject({
      title: "Linen Shirt",
      handle: "linen-shirt",
      description: "Soft linen.",
      collection: "Shirts",
      image: "https://static.wixstatic.com/media/a1b2c3~mv2.jpg",
      status: "active",
    });
    // The hidden M variant stays out.
    expect(shirt.variants).toEqual([
      { title: "S", sku: "LIN-S", price: 4000, stock: 7, prices: {} },
      { title: "L", sku: "LIN-L", price: 4500, stock: 0, prices: {} },
    ]);
    expect(tote.status).toBe("draft");
    expect(tote.variants.map((v) => v.title)).toEqual([
      "Red / S",
      "Red / L",
      "Blue / S",
      "Blue / L",
    ]);
    expect(tote.variants.every((v) => v.price === 1550 && v.stock === 0)).toBe(
      true,
    );
    expect(parsed.notes.join(" ")).toMatch(/1 product had a Wix discount/);
  });
});

describe("customers", () => {
  it("reads Shopify's customer export with history and consent", () => {
    const parsed = parseExport(
      csv([
        "Customer ID,First Name,Last Name,Email,Accepts Email Marketing,Default Address Company,Default Address Address1,Default Address City,Default Address Phone,Phone,Accepts SMS Marketing,Total Spent,Total Orders,Note,Tax Exempt,Tags",
        "1,Asha,Rao,ASHA@Example.com,yes,,1 Main St,Pune,,+91 98450 00000,no,1234.50,7,,no,vip",
        "2,Ben,,ben@example.com,no,,,,,,no,0.00,0,,no,",
        "3,Dup,,asha@example.com,yes,,,,,,no,1,1,,no,",
        "4,No,Email,,yes,,,,,,no,1,1,,no,",
      ]),
    );
    expect(parsed.kind === "customers" && parsed.source).toBe("shopify");
    if (parsed.kind !== "customers") return;
    expect(parsed.customers).toEqual([
      {
        email: "asha@example.com",
        name: "Asha Rao",
        phone: "+91 98450 00000",
        marketing: true,
        orders: 7,
        spent: 123450,
      },
      {
        email: "ben@example.com",
        name: "Ben",
        phone: "",
        marketing: false,
        orders: 0,
        spent: 0,
      },
    ]);
    expect(parsed.notes).toEqual([
      "1 row without a valid email address will be skipped.",
      "1 repeated email will be imported once.",
    ]);
  });
  it("reads Wix contacts", () => {
    const parsed = parseExport(
      csv([
        "First Name,Last Name,Email 1,Phone 1,Labels,Email subscriber status",
        "Mia,Chen,mia@example.com,555-0100,Customer,Subscribed",
        "Leo,,leo@example.com,,,Never subscribed",
      ]),
    );
    expect(parsed.kind === "customers" && parsed.source).toBe("wix");
    if (parsed.kind !== "customers") return;
    expect(parsed.customers.map((c) => [c.name, c.marketing])).toEqual([
      ["Mia Chen", true],
      ["Leo", false],
    ]);
  });
});

it("still reads Skynoveau's own product template", () => {
  const parsed = parseExport(
    csv([
      "title,description,collection,image,status,variant,sku,price,stock",
      "Mug,Nice,Kitchen,,active,Blue,M-B,12.5,3",
      "Mug,Nice,Kitchen,,active,Red,M-R,13,0",
    ]),
  );
  expect(parsed.kind === "products" && parsed.source).toBe("forma");
  if (parsed.kind === "products")
    expect(parsed.products[0].variants.map((v) => v.price)).toEqual([
      1250, 1300,
    ]);
});
it("rejects a file it doesn't recognise", () => {
  expect(() => parseExport(csv(["a,b", "1,2"]))).toThrow(
    /Shopify or Wix export/,
  );
});
it("reads prices and HTML the way stores write them", () => {
  expect(cents("1,299.00")).toBe(129900);
  expect(cents("1.299,50")).toBe(129950);
  expect(cents("$12")).toBe(1200);
  expect(Number.isNaN(cents(""))).toBe(true);
  expect(plainText("<script>x()</script><p>Hi&nbsp;&amp; bye</p>")).toBe(
    "Hi & bye",
  );
});

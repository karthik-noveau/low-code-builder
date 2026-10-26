import type { TemplateId } from "../studio/model";

export function TemplateArt({
  template,
  eager = false,
}: {
  template: TemplateId;
  eager?: boolean;
}) {
  const loading = eager ? "eager" : "lazy";
  if (template === "blank")
    return (
      <div className="template-art art-blank" aria-hidden="true">
        <div className="blank-cross">+</div>
        <span>
          Your next big thing,
          <br />
          from a blank page.
        </span>
      </div>
    );
  if (template === "botanical")
    return (
      <div className="template-art art-botanical" aria-hidden="true">
        <div className="art-announcement">A LITTLE GREEN GOES A LONG WAY.</div>
        <div className="art-nav">
          <strong>
            botanical<span>.</span>
          </strong>
          <span>Shop&nbsp;&nbsp; Plant care&nbsp;&nbsp; Our story</span>
          <b>↗</b>
        </div>
        <div className="art-botanical-main">
          <img src="/images/botanical.jpg" alt="" loading={loading} />
          <div>
            <small>A GREENER EVERYDAY</small>
            <h3>
              Good things
              <br />
              <em>take root.</em>
            </h3>
            <p>Make a little room for something green.</p>
            <span className="art-button">Shop plants ↗</span>
          </div>
        </div>
        <div className="art-foot">
          <span>Cart & checkout</span>
          <span>Delivered in 2–4 days</span>
          <span>Track your order</span>
        </div>
      </div>
    );
  if (template === "folio")
    return (
      <div className="template-art art-folio" aria-hidden="true">
        <div className="art-nav">
          <strong>FORMA STUDIO</strong>
          <span>Work&nbsp;&nbsp; Studio&nbsp;&nbsp; Start a project ↗</span>
        </div>
        <div className="art-folio-heading">
          <small>SPACES WITH A POINT OF VIEW</small>
          <h3>
            Considered spaces.
            <br />
            <em>Lasting impressions.</em>
          </h3>
        </div>
        <img src="/images/architecture.jpg" alt="" loading={loading} />
        <div className="art-foot">
          <span>Case studies</span>
          <span>Enquiries, quotes & tracking</span>
        </div>
      </div>
    );
  const art = business[template];
  if (art)
    return (
      <div
        className="template-art art-table"
        aria-hidden="true"
        style={{ background: art.background, color: art.color }}
      >
        <div className="art-nav">
          <strong>{art.brand}</strong>
          <span>{art.nav}&nbsp;&nbsp;↗</span>
        </div>
        <div className="art-table-main">
          <div>
            <small>{art.eyebrow}</small>
            <h3>
              {art.title[0]}
              <br />
              <em>{art.title[1]}</em>
            </h3>
            <span
              className="art-button"
              style={{
                background: art.accent,
                borderColor: art.accent,
                color: "#fff",
              }}
            >
              {art.button} ↗
            </span>
          </div>
          <img src={art.image} alt="" loading={loading} />
        </div>
        <div className="art-foot">
          {art.foot.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </div>
      </div>
    );
  if (template === "table")
    return (
      <div className="template-art art-table" aria-hidden="true">
        <div className="art-nav">
          <strong>sunday table</strong>
          <span>Menu&nbsp;&nbsp; Order&nbsp;&nbsp; Reserve ↗</span>
        </div>
        <div className="art-table-main">
          <div>
            <small>SEASONAL. LOCAL. ALWAYS WELCOME.</small>
            <h3>
              Good food.
              <br />
              <em>Better company.</em>
            </h3>
            <span className="art-button">Order online ↗</span>
          </div>
          <img src="/images/restaurant.jpg" alt="" loading={loading} />
        </div>
        <div className="art-foot">
          <span>Pay online · Track your order</span>
          <span>Reserve a table</span>
        </div>
      </div>
    );
  return (
    <div className="template-art art-studio" aria-hidden="true">
      <div className="art-nav">
        <strong>
          common
          <br />
          ground.
        </strong>
        <span>Events&nbsp;&nbsp; Book seats&nbsp;&nbsp; Careers ↗</span>
      </div>
      <div className="art-studio-main">
        <div>
          <small>WORKSHOPS · EVENTS · COMMUNITY</small>
          <h3>
            Make something.
            <br />
            <em>Meet someone.</em>
          </h3>
        </div>
        <img src="/images/interior.jpg" alt="" loading={loading} />
      </div>
      <div className="art-foot">
        <span>Seats until sold out</span>
        <span>My tickets ↗</span>
      </div>
    </div>
  );
}

/** Thumbnails for the business templates, drawn from what each one does. */
const business: Partial<
  Record<
    TemplateId,
    {
      brand: string;
      nav: string;
      eyebrow: string;
      title: [string, string];
      button: string;
      image: string;
      foot: string[];
      background: string;
      color: string;
      accent: string;
    }
  >
> = {
  volt: {
    brand: "volt electricals",
    nav: "Products  Rewards  Warranty",
    eyebrow: "ELECTRICALS · REWARDS · WARRANTY",
    title: ["Wire it right.", "Earn on every bill."],
    button: "Join the rewards club",
    image: "/images/electrical-shop.jpg",
    foot: ["2% back on every bill", "My rewards", "Register warranty"],
    background: "#fff6ee",
    color: "#26292e",
    accent: "#e8730c",
  },
  dhanlaxmi: {
    brand: "dhanlaxmi electricals",
    nav: "Home  Add purchase  My rewards",
    eyebrow: "REWARDS FOR SHOPPING WITH US",
    title: ["Buy from us.", "Earn rewards."],
    button: "Add a purchase",
    image: "/images/electrical-shop.jpg",
    foot: ["Enter your phone", "Owner approves", "Reward added"],
    background: "#fff8f0",
    color: "#22262b",
    accent: "#e07400",
  },
  glow: {
    brand: "glow studio",
    nav: "Services  Book  My bookings",
    eyebrow: "HAIR · SKIN · NAILS",
    title: ["Leave", "glowing."],
    button: "Book an appointment",
    image: "/images/salon.jpg",
    foot: ["Free slots shown live", "Confirmed by email"],
    background: "#fdf3f0",
    color: "#5a2f29",
    accent: "#b5655a",
  },
  fixright: {
    brand: "FixRight",
    nav: "Services  Book a visit  Track",
    eyebrow: "REPAIRS · INSTALLATION · CLEANING",
    title: ["Fixed right.", "The first time."],
    button: "Book a visit",
    image: "/images/home-tools.jpg",
    foot: ["Technician scheduled", "Track by reference"],
    background: "#eef3fb",
    color: "#14335f",
    accent: "#1f6feb",
  },
  brightminds: {
    brand: "bright minds",
    nav: "Courses  Admissions  Fees",
    eyebrow: "TUITION FOR CLASS 6–12",
    title: ["Small batches.", "Big results."],
    button: "Ask for admission",
    image: "/images/classroom.jpg",
    foot: ["Seats per course", "Fee record for parents"],
    background: "#f4f6fe",
    color: "#1d2f6f",
    accent: "#2d5bd3",
  },
  pulse: {
    brand: "PULSE",
    nav: "Plans  Join  My card",
    eyebrow: "GYM · CLASSES · COACHING",
    title: ["Show up.", "We’ll do the rest."],
    button: "Join now",
    image: "/images/gym.jpg",
    foot: ["Pay online", "Points for every visit"],
    background: "#151a25",
    color: "#f3f4f8",
    accent: "#e5484d",
  },
  freshbasket: {
    brand: "fresh basket",
    nav: "Shop  Order  Track",
    eyebrow: "GROCERIES IN TWO-HOUR SLOTS",
    title: ["Farm fresh.", "At your door by 9."],
    button: "Start shopping",
    image: "/images/groceries.jpg",
    foot: ["Pick a delivery slot", "Track your order"],
    background: "#f1f8ec",
    color: "#1f5130",
    accent: "#2f9e44",
  },
};

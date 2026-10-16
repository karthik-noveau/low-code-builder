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
          <span>Plants & pots&nbsp;&nbsp; Our story&nbsp;&nbsp; Contact</span>
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
            <span className="art-button">Find your green ↗</span>
          </div>
        </div>
        <div className="art-foot">
          <span>Grown with care</span>
          <span>Delivered to your door</span>
          <span>Here to help you grow</span>
        </div>
      </div>
    );
  if (template === "folio")
    return (
      <div className="template-art art-folio" aria-hidden="true">
        <div className="art-nav">
          <strong>FORMA STUDIO</strong>
          <span>Work&nbsp;&nbsp; About&nbsp;&nbsp; Contact ↗</span>
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
          <span>Independent design studio</span>
          <span>Selected work / 01</span>
        </div>
      </div>
    );
  if (template === "table")
    return (
      <div className="template-art art-table" aria-hidden="true">
        <div className="art-nav">
          <strong>sunday table</strong>
          <span>Our menu&nbsp;&nbsp; Visit us ↗</span>
        </div>
        <div className="art-table-main">
          <div>
            <small>SEASONAL. LOCAL. ALWAYS WELCOME.</small>
            <h3>
              Good food.
              <br />
              <em>Better company.</em>
            </h3>
            <span className="art-button">A place at our table ↗</span>
          </div>
          <img src="/images/restaurant.jpg" alt="" loading={loading} />
        </div>
        <div className="art-foot">
          <span>Fresh from the season</span>
          <span>Made with a little love</span>
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
        <span>Our approach&nbsp;&nbsp; Get in touch ↗</span>
      </div>
      <div className="art-studio-main">
        <div>
          <small>MAKE ROOM FOR POSSIBILITY</small>
          <h3>
            Big ideas.
            <br />
            <em>Thoughtful spaces.</em>
          </h3>
        </div>
        <img src="/images/interior.jpg" alt="" loading={loading} />
      </div>
      <div className="art-foot">
        <span>People. Purpose. Possibility.</span>
        <span>Discover our approach ↗</span>
      </div>
    </div>
  );
}

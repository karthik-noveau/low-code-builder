# Blocks builder

Forma pages are built from **blocks**: small pieces (text, button, image,
input, list…) nested inside layout blocks (section, box, row, columns, grid).
A **prebuilt section** is just a ready-made block tree that owners insert and
then change freely. There is one system: today's fixed section types (hero,
features, header, app form…) become prebuilt sections and are converted on
load.

## Model (`src/blocks/model.ts`)

```ts
interface Node {
  id: string;
  type: NodeType;            // registry key
  name?: string;             // owner's label in Layers
  props: Props;              // the block's content, per its registry fields
  style?: Style;             // desktop
  tablet?: Style;            // overrides at ≤ 768px
  mobile?: Style;            // overrides at ≤ 480px
  children?: Node[];         // containers only
  hidden?: boolean;
  locked?: boolean;          // editor only: kept in place (src/blocks/lock.ts)
  bind?: Binding;            // data blocks: where records come from      (phase 4)
  on?: { click?: Action };   // what happens on click                     (phase 5)
  when?: Condition;          // shown only when…                          (phase 5)
}
```

A page section is a `Section` of type `"blocks"` whose `root` is a `section`
node. Header and footer are the same, kept in `project.header` / `footer` so
they show on every page.

### Style

`Style` is a small, closed set of design properties. Colours, radius, shadow
and font sizes accept **theme tokens** (`accent`, `text`, `muted`, `surface`,
`line`, `background`, `radius`, `sm…4xl`) so a theme change restyles every
template. `style.ts` turns styles into scoped CSS (`.n-<id>{…}` plus
`@container` rules for tablet/mobile), the same in the editor and on the
published site. A row set to
stack (`direction: column`) gives its blocks `flex-basis: auto`, so the
240px share a row gives cards doesn't become their height.

### Registry (`src/blocks/registry.ts`)

Every block type declares: label, icon, category, whether it holds children
(and which), default props/style/children, and its **fields** (text, long
text, link, image, select, number, toggle, icon, colour). The Inspector draws
the Content tab from the fields, so adding a block type is one registry entry
plus a renderer case.

| Category | Blocks |
|---|---|
| Layout | section, box, row, columns, column, grid |
| Basic | heading, text, button, image, icon, list, divider, spacer, badge |
| Media | video, map, embed |
| Site | logo, menu, theme switch, accordion, social links |
| Form (phase 3) | form (app form, or contact / email signup to the inbox), field, form button, form step, step indicator, after sending, when sending fails, found record |
| Data (phase 4) | repeat (list/cards), table, stat, chart, record value |
| Logic (phase 5) | dialog (pop-up or side panel); click actions and show-when on any block |

## Editor

- **Add panel** (`AddPanel.tsx`): a flyout beside Pages/Layers, so the tree
  stays in view. One search finds blocks and sections; categories are a
  sticky index; recently added items come first (kept in this browser).
  Hovering or focusing an item shows "Adds here" on the canvas. Click or
  Enter inserts (blocks at the selection, sections at the chosen position);
  drag drops at the indicated place; ↑/↓ move through items. `A` opens it.
  Below 1600 px wide the right-hand panel steps aside while it's open (and
  comes back when it closes), so the canvas keeps its desktop width; the
  flyout overlays the canvas edge. The Saved sections dialog lists only
  saved sections, with "Browse all sections" for the Add panel.
- **After adding or moving** a block or section (Add panel, drag and drop,
  Layers, paste, duplicate, Alt ↑/↓) it is selected and the canvas scrolls
  to it (`reveal` in `actions.ts`), smoothly unless the owner prefers less
  motion; nothing scrolls when it's already in view.
- **Canvas** (`CanvasOverlay.tsx`): click selects the deepest block, drawn
  with a blue outline and a name tag (click it for the blocks it sits in) and
  a toolbar (select parent, drag, move, duplicate, more, delete) that sits
  above the block, flips below it, or goes inside when there's no room (or
  when it would cover the header, for a section right below it). "+"
  buttons sit between sections and inside the selected layout block.
  Double-click edits text in place with text tools: bold, italic and link on
  the selected words (see "Formatted text"), accent words in headings; with
  nothing selected bold and italic apply to the whole block, like size and
  alignment (per screen size). Right-click
  (or More) opens the block menu (`BlockMenu.tsx`): edit text, duplicate,
  copy, paste, move, put in a box/row, select parent, hide, delete. Drag a
  block to move it, with before/after/inside drop lines. A blank page shows
  `FirstRun.tsx`: add a section, templates, popular sections, first blocks.
- **Layers**: the page's block tree with nesting guides (an unnamed
  heading, text, button or badge shows its words, muted, after its type);
  select, rename (double-click/F2), hide, lock, drag to reorder, right-click for the block
  menu, expand/collapse all; device icons mark blocks hidden on tablet or
  phone. Sections drag between "Top of every page" (`project.header`), the
  page and "Bottom of every page" (`project.footer`): into the header or
  footer it shows on every page, out of it only on this page, said in a
  notification with Undo (`placeSection` in the store, one step). A section
  that uses page values stays on its page.
- **Lock** (`src/blocks/lock.ts`, `node.locked`; a section locks by its
  root): a locked block can't be moved, dragged, deleted or put in a box,
  and nothing is added to or taken out of it (new blocks go beside it);
  its text, style and settings stay editable, and it can be duplicated.
  Lock or unlock it from Layers (a lock on hover, kept visible while
  locked), the block menu or the toolbar; the name tag shows a lock.
  Attempts say "Locked. Unlock it in Layers to move it." The store refuses
  these changes too, so every path is covered.
- **Inspector** (`NodeInspector.tsx`): content blocks open on Content
  (registry fields), layout blocks on Layout (their settings, an "Arrange"
  control — direction, a 3 × 3 position grid, fill/spread/wrap, space
  between — and what's inside; a repeat shows cards per row and the space
  between them instead). Style (`StylePanel.tsx`) is per screen size:
  text, size (two-column numbers), spacing (a box model: outside and inside),
  background, border and corners, effects. Numbers take arrow keys (Shift:
  ×10), "24px", and scrubbing by dragging the unit; colours open a picker
  with theme swatches, a hex field and a readability hint. A typed colour
  doesn't follow the theme, so `style.ts` writes dark text and light
  backgrounds as `light-dark()`: where the site is dark (the visitor's dark
  theme, a dark section) they swap for readable ones. Rows changed for
  tablet/phone are blue, groups show how many, and the device switch has a
  dot. Group open/closed state is remembered. Data blocks add a Data tab.
- **Pages** (the site map, `Navigator.tsx`) keeps the Layers and Inspector
  rhythm: 8px steps, 16px side padding, 28px rows and buttons, 12px text.
- **Feedback**: deletes, moves, wraps and duplicates show a notification
  with Undo; every action is one undo step.
- Keyboard (`?` shows the sheet, `ShortcutSheet.tsx`): Tab/Shift+Tab next or
  previous block, Enter edits text or goes inside, Esc selects the parent,
  Alt ↑/↓ move, ⌘D duplicate, ⌘C/⌘V copy/paste, Delete.

## Phases

1. **Foundation**: model, registry, style CSS, renderer (editor and
   publish), store tree operations, Add panel, canvas selection/drag, Layers,
   Inspector Content/Style. `custom` sections convert to blocks.
2. **Prebuilt sections**: a section library; every fixed section type
   converts to blocks with the same look; the 12 templates rebuilt from
   blocks; screenshots before/after match.
3. **Forms**: form + input blocks bound to app tables (identify, steps,
   lookup, payment), replacing the fixed app form.
4. **Data**: repeat/table/stat/chart bound to collections (static on publish)
   and app tables (public views with an owner-chosen field allow-list).
5. **Logic**: click actions, conditions, page variables, dialogs.

## Classic sections (phase 2)

`src/blocks/legacy.ts` converts every fixed section type to a block tree:
`toBlocks(section, project)` for one section, `upgradeProject(project)` for a
whole project (pages, header, footer and saved sections). It runs when a
project is opened or imported (store start-up, `importProject`, cloud
`loadDraft`, backend `decodeProject`), and templates are written with the
classic section makers and built through it (`createProject`; the classic
version is `classicProject`). Classic types stay valid so old drafts and
releases load and still render; a section whose tree wouldn't validate (very
long text) stays classic.

- **Look**: the root carries `look` (e.g. `hero`, `features`, `footer-centered`)
  and `looks.css` draws it with the classic values (`.lk.lk-<look>`, three-class
  selectors so owner styles still win). The owner's settings become styles:
  colours, padding (top/bottom), alignment, height, tablet/phone overrides.
  A hero's photo shade is the section prop `shade` ("Darken the photo",
  shown only on the image banner look). The shade is a near-black tinted
  with the site's accent; behind the copy and the corner name it is at
  least 63 % (70 % across the whole hero on phones) so white text keeps
  4.5:1, and the far side keeps the owner's value. The moving background is
  `effect: "orbits"`.
- **Smart blocks** that remain: `tabBar` (the phone's bottom bar, drawn at
  the end of the page). The app form, contact, email signup, collection
  list and products smart blocks convert to form and repeat blocks
  ("Converted smart blocks" below); their types stay valid and still draw the classic markup
  (`src/studio/siteParts.tsx`) for any block that couldn't convert.
  `src/blocks/project.ts` answers site-wide questions across all kinds:
  placed app forms, inbox forms, listed collections, orbits, tab bar.
- Ids are derived from the section id, so converting twice gives the same tree.
- The thanks page visitors land on after a request (`renderThanksPage`) is
  a blocks section with the custom look, its heading the page's H1.
- Parity: every template page renders the same as before at 1280 and 390 px
  (section heights equal; pixel differences under ~1%, from 1 px rounding).

## Forms (phase 3)

Code: `src/blocks/forms/` (model, sync, recipes, registry, FormBlocks,
FormSettings, AddFields, presets, forms.css). Owners build any form from
blocks; the backend and its public API (`backend/apps.ts`) are unchanged.

- **Blocks.** A `form` block is bound to one AppForm (prop `form`). Inside it,
  in any layout (rows, columns, boxes, text, images):
  - `field`: one AppField (`field`), with a label, example, help text and
    width (full, half, third; full on phones). The input follows the field
    type: text, long text with a counter, number, money with the currency
    symbol, phone with +91 and a 10-digit check (INR sites; "any number" is
    an option), email, date, choice as a dropdown, a list or chips, yes/no as
    a checkbox or a switch, an item as cards, items as the menu and cart.
    Optional fields say "(optional)", as the classic form does.
  - `submit` (Form button): sends (or goes to the next page), or `back`,
    `confirm` ("Yes, that's me"), `change` and `again`.
  - `formStep`: a step shown one at a time: "Questions" (several are pages
    of one form, checked page by page), "Who are you?" (the identify field)
    and "Is this you?". `formSteps` is the step indicator.
  - `formSuccess` and `formError`: what's shown after sending and when
    sending fails. Text with `{ref}`, `{message}`, `{status}` or `{name}` is
    filled in on the site.
  - `formRecord`: who was found on "Is this you?", or what a lookup found
    (the classic result: record, progress, totals, history; the rewards page
    for step-by-step lookups).
  A lookup form is a form block on a lookup AppForm: its field blocks are the
  key (and verify) inputs, its success blocks the result.
- **Source of truth.** The AppForm owns *which* fields are sent and in what
  order (the backend reads `form.fields`); the block tree owns layout and
  wording. `syncForms(before, after)` runs on every studio commit: when the
  App builder changed `form.fields`, field blocks are added after the last
  field, removed, and reordered within the places they occupy; when field
  blocks changed (added, deleted, dragged), `form.fields` follows, and other
  blocks of the same form are brought in line. Owner-only and link fields
  stay on the form. An empty form block bound to a form gets the form's
  blocks (worded from its copy, steps, button and success message; identify
  forms get the three steps). Lookups aren't synced (key, verify and shown
  fields are App builder settings).
- **Published runtime.** The form block draws the App widget's contract
  (`.app-form[data-app-api][data-form][data-blocks-form]`, `data-step`
  forms, inputs named by field id with `data-label`, `aria-describedby` to
  `.app-field-error`, honeypot, `.app-status` live region), so APP_SCRIPT
  runs it: validation, idempotency keys, identify/confirm, payment, capacity,
  unknown/paused/offline screens and the dark theme are the classic ones.
  The widget gained, for block forms only: pages (`[data-page]`, Next checks
  the page, `back`), a step indicator over any steps (`data-steps`), the
  owner's failure blocks (`[data-form-error]`), placeholders and focusing a
  screen's heading. Steps the owner didn't build (Is this you? for an
  identify form, payment, loading, not found) are drawn from the classic
  markup. Classic `appForm` blocks and App sections keep working.
- **Editor.** Every step shows, labelled ("Step 2 · Is this you?", "After
  sending", "When sending fails"); inputs look real but leave clicks to the
  canvas. The Inspector's Form setting picks the form or makes a "New form…"
  on an existing or new table, lists the questions, offers the table's
  unasked fields and "New question…". A field block picks its field (or
  "New field…"), how choices and yes/no show, and Required (on the field).
  The Add panel lists "Form fields" of the selected form's table.
- **Prebuilt sections** ("Forms"): contact, booking (two pages), order,
  registration, feedback and order tracking. Their form blocks carry a
  `recipe` (`recipes.ts`): on insert the studio reuses a matching table or
  adds one (making the business app if there isn't one) and adds the form;
  tracking looks in the orders or bookings table.
- **Preview and export.** Only the first step shows, disabled, with "Works
  on your published site" / "Works when published with Forma".

## Data (phase 4)

Code: `src/blocks/data/` (bind, views, blocks, runtime, presets, live),
the Inspector's Data tab (`src/blocks/editor/DataPanel.tsx`) and the public
read API in `backend/apps.ts`.

- **Blocks.** `repeat` (grid, list or carousel) repeats its first box (the
  card) per item and shows its `slot: "empty"` box when there are none;
  `stat` (a dashboard card's figure or a collection's count), `chart` (a
  dashboard chart, bars or a line) and `table` (a view's rows; one card per
  row on phones). `props.source` is `collection:<id>`, `view:<id>`,
  `card:<id>`, `chart:<id>` or `store:products` (Forma Store, below).
- **Bindings.** Inside a repeat, `node.bind` maps a prop to `field:<id>`,
  `item:title`, `item:link` or `item:index`; store products also give
  `item:price`, `item:image`, `item:description` and `item:category`. Text props get the shown value
  (prices and dates formatted), `src`/`url`/`link` the stored one.
- **Collections** resolve while rendering: published pages carry the items
  as HTML (filter, sort and limit are the repeat's).
- **Store products** (`store:products`, `src/blocks/data/store.ts`; only
  `props.category` if set, matched to the product's collection without
  case; the repeat's limit). The catalogue isn't in the project: at publish
  `publicationCommerce` (backend/commerce-publishing.ts `websiteProducts`)
  reads the active products, sorted by name, up to 100, as the website
  shows them: name, description, photo, the lowest variant price formatted
  as the store formats it (`storePrice`, the store's currency), the
  product's page in the store (`/store?site=…&product=…`) and its category.
  The compiler draws them into the page as HTML (`RenderContext.store`) and
  publishes their photos with the site. Without the store's catalogue on
  the website ("Fill published product blocks…" off, no open store, or the
  hosted mode, where Forma Store doesn't run) a store repeat shows its
  "When there are no products" box. Changing products or prices changes the
  release's `commerceChecksum`, so publishing again rebuilds (stock alone
  doesn't). The classic cards have no add-to-cart button (the header's Shop
  button links to the store), so there is no cart path; `item:link` opens
  the product's page, where it is added to the cart.
- **App data** is private unless the owner makes a **view**
  (`app.views`): the only fields visitors get (allow-list), statuses, a fixed
  filter, order and a limit (1–100), `public` on/off. Phone and email fields
  (and links to records named by one) need `contact` consent; names can be
  shown as "Priya S." (`initials`). Dashboard cards and charts need `public`.
  Only public views reach the live release's config.
- **Public API.** `GET /apps/:site/views/:view?page=&size=` (allow-listed,
  formatted values; no record ids or references; paging stops at the limit)
  and `GET /apps/:site/metrics` (numbers only). Live release only, 60 reads
  per IP per minute, CORS open without credentials like the form routes,
  rows cached 10 s per release. Types in `src/apps/api-types.ts`.
- **Published runtime.** App data blocks publish a skeleton plus a
  `<template>` with markers; the data script (appended to app.js, same CSP)
  fills it with text and checked URLs, handles empty, error (Try again) and
  Load more, and announces results politely.
- **Editor.** Blocks show the owner's real records (owner API, the same view
  rules) or sample rows on a local draft; the Data tab picks the source,
  sets up views ("Show on your website: these fields only") and bindings.
  Store repeats read `GET /sites/:id/commerce/catalog` (owner API, any
  member; read only, so it never sets up a store): whether the store is
  open, whether it fills the website, and the same products the publisher
  draws (`useStoreCatalog`, live.ts). They show those products, or sample
  products with a note saying what visitors see (a local draft, no open
  store, the catalogue off, or nothing in the category). Previews outside
  the editor (template gallery, site thumbnails) show the "no products" box,
  as a site without a store does. The Data tab offers "Store products" when
  the site's store is open (or the repeat already lists it) and a Category.
- **Classic smart blocks**: `collectionList` and `products` convert to
  repeats (below).

## Converted smart blocks

`upgradeSmart` in `src/blocks/legacy.ts` (run by `upgradeProject` on every
open, import, cloud load and backend decode, after the classic sections are
converted) replaces the classic smart blocks inside blocks sections, saved
sections included. The new block keeps the old block's id (so its `n-<id>`
styles and the form's element ids are unchanged) and its parts get ids
derived from it (`<id>-c0`, `-c1`…), so converting again changes nothing. A
block whose form or collection is gone, or a tree that wouldn't validate,
stays as it was; the smart types still render.

- **App form → form block, look "classic"** (`forms/classic.tsx`). The
  children are the form's own blocks (`formChildren`, as a new form block
  gets them), worded as the classic form was (the button's default, "Send
  another" / "Place another order" / "Record another", "Yes, that's me",
  the step-by-step done title), with the form's title (`part: "title"`,
  H1 or H2) and intro (`part: "intro"`) first. With the classic look the
  block draws the classic App form markup (`AppFormMarkup`, without
  `data-blocks-form`), so the widget runs the classic paths: identify and
  confirm, menu and cart, payment, capacity, lookups and the rewards page.
  The words come from the blocks, read by where they sit: field blocks'
  label, example and help; buttons' labels; each step's heading, intro and
  note; "Sending as {name}"; the success heading. Blocks the owner adds in a
  step are drawn in it (before its error line); hiding the title hides the
  heading. In the editor the title, fields and buttons select their blocks,
  and the words drawn on the canvas are typed in place as ordinary blocks'
  are (double-click, Enter; Escape cancels, ⌘Enter or clicking away saves;
  one undo step; locks as elsewhere, so text stays editable): the title,
  intro, a step's heading, intro and note, field labels and help, and the
  Continue / send buttons. `FormCustom.text` draws each piece (editor only:
  published HTML is unchanged) and `classicPart` (`forms/classicWords.ts`)
  says which block and prop it is. Plain text only (the classic markup shows
  no formatting), so the text tools show just Done. Examples (placeholders,
  inside disabled boxes) and the words of steps the editor doesn't draw
  (confirm, success) stay in the Inspector.
  The form's **Look** setting switches to "Blocks", which lays the same
  blocks out freely (the phase 3 form).
- **Contact and Email signup → form block, `target: "inbox"`** (`kind`
  `contact` or `newsletter`, `action` the owner's own endpoint). Its field
  blocks are the boxes (`field` = `name`, `email` or `message`; label,
  example, `hideLabel`) and its Form button the button. It draws the same
  `<form action=inbox method=POST>` as before: the hidden `form` kind, the
  honeypot (`website`), boxes named for the inbox, the classic classes
  (`blk-contactForm`, `blk-newsletter`). It isn't synced with the app.
  `inboxForms` (project.ts) feeds the inbox config and the thanks page. The
  Add panel's Contact form and Email signup make these (`createNode`); App
  form and Collection list are no longer offered (Form and Repeat are).
- **Collection list → repeat** over `collection:<id>` with look `listing`
  (`rl-listing`, drawn by looks.css with the classic `.site-listing`
  values), its layout (`grid`/`list`), limit and columns (`style.columns`).
  The card is a box (linked to the item's page via `item:link` when the
  collection has item pages) holding the photo (bound to the display image,
  ratio from the look), a "Copy" box with the title row (heading bound to
  `item:title`, the price), the subtitle (eyebrow) and the summary, and,
  without item pages, the call-to-action link. Parts show only when the
  item has them (`when` item rules, decided at publish, no logic.js).
- **Products → repeat** over `store:products` with look `products`
  (`rl-products`, looks.css: the cards sit as in `.blk-products`, the
  block's columns and gap), limit 12 (the classic block showed the first
  12), built by `storeRepeat` (data/storeCard.ts). The card is the classic
  card (`itemCard`) bound to the item: the photo (`item:image`, alt the
  name, linking to `item:link`, radius from the theme) or, without one, the
  placeholder tile linking there; the "Title" row with the name and the
  price (shown when set); the description (shown when set). The block's own
  cards, which visitors saw while the store didn't fill the website, move
  unchanged (same ids) into the repeat's "When there are no products" box,
  in a grid with the block's columns and gap, so those sites look as
  before. A block holding anything but boxes stays smart. The Add panel's
  Products makes a store repeat (`createNode`), its empty box saying new
  products are on their way. One difference: with the catalogue on but no
  active products, the classic block was an empty grid; the repeat shows
  its "no products" box (the owner's cards, which the editor shows too).
- **Parity.** For all 12 templates (Dhanlaxmi included) the published
  pages render pixel-identically at 1280 and 390 px before and after (every
  page 0.000% different, section heights equal); app form and inbox pages
  publish the same body HTML (only CSS rules for blocks that the classic
  look doesn't draw are added). `src/blocks/convert.test.tsx` checks this
  for every template. Publishing bumps `compilerVersion` to 11. Products
  (Botanical, its Home and Collection pages) publish pixel-identically at
  1280 and 390 px both with Forma Store's catalogue and without a store;
  the test compares what the pages show (tags, links, images, words) with
  and without a catalogue. `compilerVersion` 12 republishes products blocks
  as store repeats.

## Logic (phase 5)

`src/blocks/logic/` makes pages interactive without code. It is all data
(`model.ts`), carried out by the editor's preview and by the published page's
`logic.js` (`runtime.ts`). Nothing is ever evaluated as code.

- **Click actions** (`node.on.click`, 1–3 run in order) on buttons, images,
  icons, boxes (cards in a repeat), text, headings and badges: open a page or
  link, scroll to a section, open or close a dialog, call, WhatsApp, email,
  copy text (with a "Copied" note), set or toggle a page value, open an app
  form in a dialog. Navigation, call, WhatsApp and email are drawn as real
  `<a href>`, so they work without the script.
- **Show only when** (`node.when`, all/any of up to 4 rules): a page value,
  a URL query param (`?ref=`), light or dark theme, a date range (resolved at
  publish and checked again in the browser), or inside a repeat a field of the
  item. Screen size stays "Hide on this device" in Style. Without the script
  each block shows its default state.
- **Page values** (`page.variables`, at most 20; `^[a-z][a-z0-9_]{0,31}$`,
  text, number or yes/no, optionally remembered on the visitor's device).
  Text shows one with `{var:name}`; renaming a value updates its uses.
- **Dialog** (`dialog` container): a centred pop-up or side panel, outside
  the page flow, opened by actions. It has a labelled title and a close button,
  keeps focus inside, closes on Esc and returns focus to the opener. In the
  editor it is listed in Layers and drawn on the canvas while selected.
- **Security.** Links must be http(s), site-relative, `#section`, `tel:`,
  `mailto:` or wa.me (`safeLink`; never `javascript:` or `data:`). Lists,
  names and values are capped in `validate.ts`, and query rules compare
  strings only. The runtime reads its config from data attributes and
  writes only with `textContent`, attributes, `hidden` and classes. `logic.js`
  is served beside `app.js` and loaded only by pages that use logic, under
  the same `script-src 'self'` policy.
- **Editor.** An Actions tab ("When clicked", "Show only when…", "Page
  values"), lightning and condition badges on the canvas, and "Preview as"
  to see the page with a value, theme, link or date. Clicks never run while
  editing, only in Preview.
- **Sections** ("Interactive"): tabs, monthly/yearly pricing, Book now in a
  dialog, dismissible announcement, limited-time offer, WhatsApp contact.

## Formatted text

`src/blocks/richtext.tsx` (markup, parser, React drawing),
`src/blocks/editor/richDom.ts` and `RichInlineText.tsx` (typing),
`TextToolbar.tsx` (tools and the link box).

- **Markup** inside the existing string props of heading (`text`), text
  (`text`), list items (`items`) and accordion answers, so the model,
  storage, validation and old drafts are unchanged:
  `**bold**`, `__italic__`, `[words](/page)`, `[words](https://… "new tab")`
  and, in headings only, `*accent*` (unchanged rules). Buttons, badges and
  other text stay plain (a link can't hold a link).
- **Why this syntax.** Familiar (Markdown-like) when seen in the Inspector,
  and it can't change ordinary text: markers only count in pairs on one line,
  hugging words and not inside a word (`2**3**4`, `** x **`, `Save **20%`
  stay literal); a single `_` never counts (emails, handles, `snake_case`);
  a link needs `](` and a link-shaped address. `\` before `\ * _ [ ]` keeps
  the character literal. Every template and prebuilt section renders exactly
  as before (tested).
- **Links** become `<a>` only if `safeLink` accepts them (http(s), `/page`,
  `#section`, `tel:`, `mailto:`); others show their words. External and
  new-tab links get `rel="noopener noreferrer"`. Inside a linked or clickable
  card or a clickable heading/text, links show as words. At most 20 links per
  block (`MAX_INLINE_LINKS`, checked in `validate.ts`); page renames rewrite
  them (`mapNodeLinks`), and Review site checks them like button links.
- **Drawing**: real `<strong>`, `<em class="blk-i">` (italic; a heading's
  plain `<em>` is its accent) and `<a>`, as React elements (never HTML), the
  same in the editor and the published HTML (no script).
- **Typing** is WYSIWYG: the text shows formatted while typed. Select words
  and press ⌘B / ⌘I / ⌘K (or the toolbar buttons); formatting covers whole
  words (a selection grows to the words it touches) and toggles off when the
  words already have it. The link box takes an address (`www.…` gets
  `https://`, emails `mailto:`, phone numbers `tel:`) or a site page, "Open
  in new tab" and Remove link. Paste arrives as plain text. ⌘Z/⇧⌘Z undo
  within the typing session; the whole edit is one undo step afterwards.
  On save the DOM is read back into canonical markup; literal markers typed
  as text are escaped only when they would otherwise format something.

- **Lists** are typed on the page too (`editor/TypedList.tsx`, helpers in
  `listItems.ts`): Enter splits a point, Backspace at the start joins it to
  the one before (an empty one goes), ↑/↓ move between points. The prop keeps
  one point per line and the whole edit is one undo step.
- **Locks and the Inspector.** Controls that add or remove a block's
  children (Columns' add/remove column) follow `lock.ts` (`childrenLock`)
  and are disabled with the lock note; the store refuses such changes too
  (`keepsLocks`).
- **Pages view** drags sections between the shared header/footer lists and
  the page's list with `placeSectionAt` (editor/actions.ts), the same rules,
  toasts and Undo as Layers.

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
published site.

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
| Form (phase 3) | form, field, form button, form step, step indicator, after sending, when sending fails, found record |
| Data (phase 4) | repeat (list/cards), table, stat, chart, record value |
| Logic (phase 5) | click actions, show-when conditions, dialog |

## Editor

- **Add panel** (`AddPanel.tsx`): a flyout beside Pages/Layers, so the tree
  stays in view. One search finds blocks and sections; categories are a
  sticky index; recently added items come first (kept in this browser).
  Hovering or focusing an item shows "Adds here" on the canvas. Click or
  Enter inserts (blocks at the selection, sections at the chosen position);
  drag drops at the indicated place; ↑/↓ move through items. `A` opens it.
- **Canvas** (`CanvasOverlay.tsx`): click selects the deepest block, drawn
  with a blue outline and a name tag (click it for the blocks it sits in) and
  a toolbar (select parent, drag, move, duplicate, more, delete) that sits
  above the block, flips below it, or goes inside when there's no room. "+"
  buttons sit between sections and inside the selected layout block.
  Double-click edits text in place with text tools (accent words in headings,
  bold, italic, size, alignment; whole-block, per screen size). Right-click
  (or More) opens the block menu (`BlockMenu.tsx`): edit text, duplicate,
  copy, paste, move, put in a box/row, select parent, hide, delete. Drag a
  block to move it, with before/after/inside drop lines. A blank page shows
  `FirstRun.tsx`: add a section, templates, popular sections, first blocks.
- **Layers**: the page's block tree with nesting guides; select, rename
  (double-click/F2), hide, drag to reorder, right-click for the block menu,
  expand/collapse all; device icons mark blocks hidden on tablet or phone.
- **Inspector** (`NodeInspector.tsx`): content blocks open on Content
  (registry fields), layout blocks on Layout (their settings, an "Arrange"
  control — direction, a 3 × 3 position grid, fill/spread/wrap, space
  between — and what's inside). Style (`StylePanel.tsx`) is per screen size:
  text, size (two-column numbers), spacing (a box model: outside and inside),
  background, border and corners, effects. Numbers take arrow keys (Shift:
  ×10), "24px", and scrubbing by dragging the unit; colours open a picker
  with theme swatches, a hex field and a readability hint. Rows changed for
  tablet/phone are blue, groups show how many, and the device switch has a
  dot. Group open/closed state is remembered. Data blocks add a Data tab.
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
  A hero's photo shade is the section prop `shade`; the moving background is
  `effect: "orbits"`.
- **Smart blocks** draw the classic markup (`src/studio/siteParts.tsx`):
  `appForm` (form, title and intro or breadcrumb), `collectionList`,
  `contactForm` and `newsletter` (post to the inbox), `products` (cards the
  publisher replaces with Forma Store products) and `tabBar` (the phone's
  bottom bar, drawn at the end of the page). `src/blocks/project.ts` answers
  site-wide questions across both kinds: placed app forms, orbits, tab bar.
- Ids are derived from the section id, so converting twice gives the same tree.
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
  `card:<id>` or `chart:<id>`.
- **Bindings.** Inside a repeat, `node.bind` maps a prop to `field:<id>`,
  `item:title`, `item:link` or `item:index`. Text props get the shown value
  (prices and dates formatted), `src`/`url`/`link` the stored one.
- **Collections** resolve while rendering: published pages carry the items
  as HTML (filter, sort and limit are the repeat's).
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
- **Classic smart blocks** `collectionList` and `products` stay as they are
  (exact classic markup; Forma Store fills `products` at publish).
